[CmdletBinding()]
param(
  [string]$ProjectRef = 'fnmxlmjrkgojowpzrcwa',
  [string]$AccessTokenPath = (Join-Path $PSScriptRoot '..\stripe-app\supabase-access-token-local.md'),
  [string]$WebhookEndpointId,
  [int]$Credits = 1000,
  [int]$Consume = 750,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
if ($Consume -le 0 -or $Credits -le $Consume) { throw 'Credits must be greater than the positive consume amount.' }
if (-not (Get-Command stripe -ErrorAction SilentlyContinue)) { throw 'Stripe CLI is required. Run: stripe login' }
if (-not (Test-Path -LiteralPath $AccessTokenPath)) { throw "Supabase access token file not found: $AccessTokenPath" }
$apexAccessToken = (Get-Content -Raw -LiteralPath $AccessTokenPath).Trim()
if ($apexAccessToken -notmatch '^sbp_') { throw 'The Supabase access token file is invalid.' }

function Invoke-Database([string]$Sql) {
  $body = ConvertTo-Json -InputObject @{ query = $Sql } -Compress
  Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" `
    -Headers @{ Authorization = "Bearer $apexAccessToken" } -ContentType 'application/json' -Body $body
}

function Invoke-StripeJson([string[]]$StripeArgs) {
  $output = & stripe @StripeArgs --color off
  if ($LASTEXITCODE -ne 0) { throw "Stripe CLI failed: stripe $($StripeArgs -join ' ')" }
  $output | ConvertFrom-Json
}

function Assert-StripeId([string]$Value, [string]$Prefix) {
  if ($Value -notmatch "^$Prefix`_[A-Za-z0-9]+$") { throw "Unexpected Stripe identifier for $Prefix." }
}

function Wait-ForRow([scriptblock]$Query, [string]$Description) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $result = & $Query
    if ($result -and @($result).Count -gt 0) { return @($result)[0] }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $Description."
}

$connections = Invoke-Database @"
select m.workspace_id, m.stripe_connection_id, m.endpoint_token
from public.stripe_manual_webhook_connections m
where m.enabled
order by m.created_at
limit 1;
"@
if (-not $connections) { throw 'No enabled APEX manual Stripe webhook connection exists.' }
$connection = @($connections)[0]
if ($connection.workspace_id -notmatch '^[0-9a-f-]{36}$' -or $connection.stripe_connection_id -notmatch '^[0-9a-f-]{36}$') {
  throw 'The configured workspace identifiers are invalid.'
}

if (-not $WebhookEndpointId) {
  $endpointUrl = "https://$ProjectRef.supabase.co/functions/v1/apex-manual-stripe-webhook/$($connection.endpoint_token)"
  $endpointList = Invoke-StripeJson @('webhook_endpoints', 'list', '--limit', '100')
  $WebhookEndpointId = @($endpointList.data | Where-Object { $_.url -eq $endpointUrl -and $_.status -eq 'enabled' })[0].id
}
Assert-StripeId $WebhookEndpointId 'we'

# Preserve the browser Checkout demo and add the CLI-testable payment event.
$null = Invoke-StripeJson @('webhook_endpoints', 'update', $WebhookEndpointId,
  '--enabled-events', 'checkout.session.completed',
  '--enabled-events', 'checkout.session.async_payment_succeeded',
  '--enabled-events', 'payment_intent.succeeded',
  '--enabled-events', 'charge.refunded', '--confirm')

$runId = [guid]::NewGuid().ToString('N')
$stripeCustomer = Invoke-StripeJson @('customers', 'create', '--name', "APEX lifecycle proof $runId", '-d', "metadata[apex_proof_run]=$runId")
Assert-StripeId $stripeCustomer.id 'cus'

$payment = Invoke-StripeJson @('payment_intents', 'create', '--amount', '100', '--currency', 'usd',
  '--customer', $stripeCustomer.id, '--payment-method', 'pm_card_visa',
  '--automatic-payment-methods[enabled]=true', '--confirm=true', '--off-session=true',
  '-d', "metadata[apex_credits]=$Credits", '-d', "metadata[apex_proof_run]=$runId")
Assert-StripeId $payment.id 'pi'
if ($payment.status -ne 'succeeded') { throw "Test payment did not succeed (status: $($payment.status))." }

$customer = Wait-ForRow {
  Invoke-Database "select id from public.customers where workspace_id = '$($connection.workspace_id)' and stripe_customer_id = '$($stripeCustomer.id)' limit 1;"
} 'APEX customer creation'

$paymentEvent = Wait-ForRow {
  Invoke-Database "select stripe_event_id, attempt_count from public.stripe_webhook_events where stripe_connection_id = '$($connection.stripe_connection_id)' and event_type = 'payment_intent.succeeded' and payload->>'object_id' = '$($payment.id)' and status = 'processed' limit 1;"
} 'processed payment event'
Assert-StripeId $paymentEvent.stripe_event_id 'evt'

$afterGrant = @(Invoke-Database "select remaining, version from public.credit_accounts where workspace_id = '$($connection.workspace_id)' and customer_id = '$($customer.id)';")[0]
if ([decimal]$afterGrant.remaining -ne $Credits) { throw "Grant assertion failed: expected $Credits, got $($afterGrant.remaining)." }

$consumeKey = "proof:$runId:consume"
$consumeResult = @(Invoke-Database "select public.consume_credits('$($connection.workspace_id)'::uuid, '$($customer.id)'::uuid, $Consume, '$consumeKey') as result;")[0].result
if (-not $consumeResult.allowed -or [decimal]$consumeResult.remaining -ne ($Credits - $Consume)) { throw 'Consume assertion failed.' }

$refund = Invoke-StripeJson @('refunds', 'create', '--payment-intent', $payment.id, '--reason', 'requested_by_customer', '--confirm')
Assert-StripeId $refund.id 're'
$chargeId = if ($payment.latest_charge -is [string]) { $payment.latest_charge } else { $payment.latest_charge.id }
Assert-StripeId $chargeId 'ch'

$refundEvent = Wait-ForRow {
  Invoke-Database "select stripe_event_id, attempt_count from public.stripe_webhook_events where stripe_connection_id = '$($connection.stripe_connection_id)' and event_type = 'charge.refunded' and payload->>'object_id' = '$chargeId' and status = 'processed' limit 1;"
} 'processed refund event'
Assert-StripeId $refundEvent.stripe_event_id 'evt'

$null = Invoke-StripeJson @('events', 'resend', $paymentEvent.stripe_event_id, '--webhook-endpoint', $WebhookEndpointId, '--confirm')
$null = Invoke-StripeJson @('events', 'resend', $refundEvent.stripe_event_id, '--webhook-endpoint', $WebhookEndpointId, '--confirm')
Start-Sleep -Seconds 3

$proof = @(Invoke-Database @"
select
  a.remaining,
  (select count(*) from public.credit_grants g where g.workspace_id = a.workspace_id and g.customer_id = a.customer_id and g.source_payment_id = '$($payment.id)') as grant_count,
  (select count(*) from public.credit_ledger l where l.workspace_id = a.workspace_id and l.customer_id = a.customer_id and l.entry_type = 'refund') as refund_count,
  (select count(*) from public.credit_ledger l where l.workspace_id = a.workspace_id and l.customer_id = a.customer_id and l.entry_type = 'unrecoverable') as unrecoverable_count,
  (select attempt_count from public.stripe_webhook_events e where e.stripe_connection_id = '$($connection.stripe_connection_id)' and e.stripe_event_id = '$($paymentEvent.stripe_event_id)') as payment_replays,
  (select attempt_count from public.stripe_webhook_events e where e.stripe_connection_id = '$($connection.stripe_connection_id)' and e.stripe_event_id = '$($refundEvent.stripe_event_id)') as refund_replays
from public.credit_accounts a
where a.workspace_id = '$($connection.workspace_id)' and a.customer_id = '$($customer.id)';
"@)[0]

if ([decimal]$proof.remaining -ne 0 -or [int]$proof.grant_count -ne 1 -or [int]$proof.refund_count -ne 1 -or [int]$proof.unrecoverable_count -ne 1 -or [int]$proof.payment_replays -lt 1 -or [int]$proof.refund_replays -lt 1) {
  throw "Lifecycle proof failed: $($proof | ConvertTo-Json -Compress)"
}

[pscustomobject]@{
  result = 'PASS'
  stripe_customer = $stripeCustomer.id
  payment_intent = $payment.id
  payment_event = $paymentEvent.stripe_event_id
  refund = $refund.id
  refund_event = $refundEvent.stripe_event_id
  granted = $Credits
  consumed = $Consume
  refunded_unspent = $Credits - $Consume
  unrecoverable_spent = $Consume
  remaining = [decimal]$proof.remaining
  payment_replays = [int]$proof.payment_replays
  refund_replays = [int]$proof.refund_replays
} | Format-List
