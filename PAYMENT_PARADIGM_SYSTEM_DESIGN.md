# Payment Paradigm — Engineering and Mathematical Design

## Purpose

This document is the technical design specification for Apex's future **Payment Paradigm** recommendation system.

The system should recommend how a SaaS product should monetize itself by answering three questions:

1. **What do you meter?**
2. **How do you package it?**
3. **When and how does the customer pay?**

The central economic question is:

> **What quantity naturally increases as the customer receives more value from the product?**

The recommendation engine should be primarily deterministic and implemented in Python.

The system must not invent novel pricing models merely because they appear mathematically attractive. Apex should select and compose from a governed catalog of pricing paradigms that have documented industry precedent, research, literature, or real-world use.

The intended output is a **Payment Paradigm**: a structured, explainable, evidence-backed commercial design that can later map directly into Stripe products/prices, entitlements, usage meters, limits, credits, overages, refunds, and enforcement rules.

---

# 1. Core Computational Problem

At the highest level:

```text
Business characteristics
        +
Established pricing paradigms
        +
Economic constraints
        +
Evidence / precedent
        ↓
Recommended Payment Paradigm
```

Formally:

[
R = f(B, P, E, C)
]

Where:

- (B) = normalized business profile
- (P) = governed catalog of established pricing paradigms
- (E) = evidence and precedent attached to those paradigms
- (C) = constraints and commercial objectives
- (R) = recommendation result

The recommendation result should contain:

[
R = (M, K, T, O, Q, X)
]

Where:

- (M) = meter
- (K) = packaging structure
- (T) = payment timing / billing structure
- (O) = overage / commitment behavior
- (Q) = quantified confidence and robustness
- (X) = human-readable explanation and evidence

---

# 2. Design Philosophy

Apex should behave as an **expert decision system**, not a chatbot guessing at pricing.

The architecture should prioritize:

1. Deterministic reasoning
2. Explicit data structures
3. Hard constraints before ranking
4. Explainable scoring
5. Sensitivity analysis
6. Simulation under uncertainty
7. Evidence-backed recommendation eligibility
8. Reproducibility
9. Versioned rules and assumptions
10. Human override

An LLM may eventually assist with:

- interpreting free-form founder descriptions
- converting natural language into structured inputs
- rewriting explanations in plain English

An LLM should not be required to:

- choose the winning paradigm
- assign economic scores
- bypass hard constraints
- invent undocumented paradigms
- create unsupported precedent

The decision authority remains the Python engine.

---

# 3. System Architecture

```text
Founder / Product Inputs
        |
        v
Structured Intake Layer
        |
        v
Normalization + Validation
        |
        v
BusinessProfile
        |
        +-----------------------------+
        |                             |
        v                             v
Value Metric Analysis          Cost Driver Analysis
        |                             |
        +--------------+--------------+
                       |
                       v
              Candidate Meter Ranking
                       |
                       v
             Paradigm Eligibility Filter
                       |
                Hard Constraints
                       |
                       v
          Multi-Criteria Scoring Engine
                       |
                       v
           Paradigm Composition Engine
                       |
           +-----------+------------+
           |                        |
           v                        v
   Scenario Simulation       Evidence Validation
           |                        |
           +------------+-----------+
                        |
                        v
             Robustness / Confidence
                        |
                        v
              Explanation Generator
                        |
                        v
              Payment Paradigm
                        |
                        v
       Stripe / Apex Implementation Mapping
```

---

# 4. Business Ontology

The engine cannot reason directly over vague product descriptions.

It requires a normalized representation of the business.

Apex should convert founder answers into a structured `BusinessProfile`.

```python
@dataclass
class BusinessProfile:
    product_type: str

    value_metric_candidates: list["MetricCandidate"]
    cost_driver_candidates: list["MetricCandidate"]

    usage_variability: float
    customer_size_variability: float
    customer_budget_predictability_need: float
    marginal_cost_variability: float
    expansion_potential: float

    measurable_usage: bool
    measurable_outcome: bool
    measurable_seats: bool
    measurable_transactions: bool
    measurable_capacity: bool

    value_correlates_with_seats: float
    value_correlates_with_usage: float
    value_correlates_with_transactions: float
    value_correlates_with_outcomes: float
    value_correlates_with_capacity: float

    recurring_value: bool
    episodic_value: bool
    continuous_protection: bool

    buyer_prefers_predictability: float
    vendor_needs_cost_protection: float
    willingness_to_commit: float

    confidence: float
```

Most scalar values should be normalized:

[
x in [0,1]
]

Where:

- (0) = absent / irrelevant
- (1) = strongly present / highly relevant

This normalization simplifies scoring, simulation, and sensitivity analysis.

---

# 5. Meter Candidate Representation

The question:

> **What quantity naturally increases as the customer receives more value from my product?**

should produce one or more structured candidates.

Examples:

- users
- devices
- repositories
- projects
- API calls
- documents processed
- transactions
- storage
- compute
- successful outcomes
- protected assets
- credits consumed

Each candidate should be scored across multiple dimensions.

```python
@dataclass
class MetricCandidate:
    id: str
    name: str
    category: str

    value_correlation: float
    cost_correlation: float
    measurability: float
    predictability: float
    customer_comprehension: float
    manipulation_resistance: float
    attribution_strength: float
    expansion_alignment: float
    stability_over_time: float
```

A metric is valuable only if it performs well across several properties.

---

# 6. Value Metric Scoring

For meter candidate (m):

[
S_m =
w_v V_m +
w_c C_m +
w_q Q_m +
w_p P_m +
w_u U_m +
w_g G_m +
w_a A_m +
w_e E_m +
w_s S_m^{*}
]

Where:

- (V_m) = correlation with customer value
- (C_m) = correlation with vendor cost
- (Q_m) = measurability
- (P_m) = predictability
- (U_m) = customer comprehensibility
- (G_m) = resistance to gaming
- (A_m) = attribution strength
- (E_m) = expansion alignment
- (S_m^{*}) = stability over time

And:

[
sum_i w_i = 1
]

Example default weights:

```python
METER_WEIGHTS = {
    "value_correlation": 0.25,
    "cost_correlation": 0.10,
    "measurability": 0.15,
    "predictability": 0.10,
    "customer_comprehension": 0.10,
    "manipulation_resistance": 0.08,
    "attribution_strength": 0.08,
    "expansion_alignment": 0.10,
    "stability_over_time": 0.04,
}
```

These weights should eventually be configurable and versioned.

---

# 7. Customer Value vs. Vendor Cost

One of the most important concepts in the engine is that customer value and vendor cost are often driven by different variables.

Formally:

[
V(x) 
eq C(x)
]

Examples:

```text
Customer value:
repositories protected

Vendor cost:
scan volume
```

or:

```text
Customer value:
successful support resolutions

Vendor cost:
model tokens + tool calls + compute time
```

The engine should compute divergence between the best value metric and best cost metric.

One simple formulation:

[
D = 1 - 	ext{sim}(m_v, m_c)
]

Where:

- (m_v) = best customer-value metric
- (m_c) = best cost-driver metric
- (	ext{sim}) = normalized similarity of the two economic roles

A simpler implementation can use:

```python
def value_cost_divergence(
    value_metric: MetricCandidate,
    cost_metric: MetricCandidate,
) -> float:
    if value_metric.id == cost_metric.id:
        return 0.0

    return min(
        1.0,
        abs(value_metric.value_correlation - value_metric.cost_correlation)
        + abs(cost_metric.cost_correlation - cost_metric.value_correlation)
    ) / 2
```

High divergence is a strong signal for **hybrid pricing**.

---

# 8. Governed Pricing Paradigm Catalog

Apex should maintain a versioned catalog of established paradigms.

Examples:

- Flat-rate subscription
- Per-seat
- Per-device
- Concurrent-user
- Site / organization license
- Tiered subscription
- Usage-based
- Credit-based
- Transaction-based
- Capacity-based
- Outcome-based
- Modular / add-on
- Hybrid base + usage
- Minimum commitment + overage
- Prepaid usage
- Postpaid metered billing
- Annual committed spend
- Revenue-share / take-rate

Each paradigm must have evidence.

```python
@dataclass(frozen=True)
class ParadigmEvidence:
    source_id: str
    title: str
    publisher: str
    url: str
    source_type: str
    published_at: date | None
    retrieved_at: datetime
    notes: str | None = None
```

```python
@dataclass(frozen=True)
class PricingParadigm:
    id: str
    name: str
    description: str

    documented: bool
    evidence: tuple[ParadigmEvidence, ...]

    suitable_when: tuple[str, ...]
    unsuitable_when: tuple[str, ...]

    supported_meter_types: tuple[str, ...]
    supported_packaging_types: tuple[str, ...]
    supported_billing_types: tuple[str, ...]

    implementation_complexity: float
    buyer_complexity: float
```

Recommendation eligibility:

```python
def is_recommendation_eligible(
    paradigm: PricingParadigm
) -> bool:
    return (
        paradigm.documented
        and len(paradigm.evidence) >= 1
    )
```

The system may store experimental paradigms, but they must be marked non-recommendable.

---

# 9. Separate Meter, Packaging, and Billing

The engine must not collapse the entire pricing design into one label.

A Payment Paradigm consists of three independently reasoned dimensions.

## 9.1 Meter

What is measured?

Examples:

- seat
- repository
- project
- transaction
- API call
- document
- credit
- storage unit
- outcome

## 9.2 Packaging

How is access or usage grouped?

```python
class PackagingType(Enum):
    FLAT = "flat"
    TIERED = "tiered"
    BUNDLED_ALLOWANCE = "bundled_allowance"
    MODULAR = "modular"
    CREDIT_PACK = "credit_pack"
    UNLIMITED_WITH_GUARDRAILS = "unlimited_with_guardrails"
```

## 9.3 Billing Structure

When and how does payment occur?

```python
class BillingType(Enum):
    MONTHLY = "monthly"
    ANNUAL = "annual"
    PREPAID = "prepaid"
    POSTPAID = "postpaid"
    COMMIT_PLUS_OVERAGE = "commit_plus_overage"
    TRANSACTIONAL = "transactional"
    REVENUE_SHARE = "revenue_share"
```

---

# 10. Payment Paradigm Data Model

```python
@dataclass
class PaymentParadigm:
    meter: MetricCandidate
    pricing_model_id: str
    packaging: PackagingType
    billing: BillingType

    included_allowance: float | None
    overage_enabled: bool
    overage_metric: str | None

    commitment_required: bool
    commitment_period: str | None

    source_paradigm_ids: list[str]
```

The system should create the final paradigm only from known components.

---

# 11. Hard Constraints

Hard constraints are evaluated before scoring.

If a paradigm violates a hard constraint, it is excluded.

Examples:

- outcome pricing when outcomes cannot be reliably measured
- transaction pricing when no transaction exists
- per-seat pricing when seat identity cannot be observed
- revenue share when transaction value is unavailable
- prepaid credits when the unit cannot be deterministically decremented

```python
def hard_constraint_violations(
    profile: BusinessProfile,
    paradigm: PricingParadigm,
) -> list[str]:
    violations = []

    if paradigm.id == "outcome_based" and not profile.measurable_outcome:
        violations.append("OUTCOME_NOT_MEASURABLE")

    if paradigm.id == "transaction_based" and not profile.measurable_transactions:
        violations.append("TRANSACTION_NOT_MEASURABLE")

    if paradigm.id == "per_seat" and not profile.measurable_seats:
        violations.append("SEATS_NOT_MEASURABLE")

    return violations
```

Hard constraints create a feasible set:

[
P_f = {p in P mid C_h(p)=0}
]

Where (C_h(p)) is the number of hard-constraint violations.

Only (P_f) proceeds to scoring.

---

# 12. Soft Constraints

Soft constraints influence score without excluding a model.

Examples:

- seat count weakly correlates with value
- pure usage pricing creates budget uncertainty
- flat-rate pricing exposes the vendor to variable cost
- credits add abstraction and cognitive load
- outcome pricing introduces attribution disputes

Represent them explicitly:

```python
@dataclass
class ScoreAdjustment:
    rule_id: str
    delta: float
    reason: str
```

This makes the recommendation auditable.

---

# 13. Multi-Criteria Decision Analysis

For candidate paradigm (p):

[
Score(p) = sum_{i=1}^{n} w_i s_i(p)
]

Where:

- (s_i(p)) = score of paradigm (p) on criterion (i)
- (w_i) = importance weight for criterion (i)

Suggested criteria:

- value alignment
- cost alignment
- buyer predictability
- vendor margin protection
- measurability
- attribution
- expansion alignment
- buyer comprehension
- gaming resistance
- operational simplicity
- billing implementation feasibility
- refund/reversal tractability
- sales compatibility
- contract compatibility

Example:

```python
PARADIGM_WEIGHTS = {
    "value_alignment": 0.18,
    "cost_alignment": 0.12,
    "buyer_predictability": 0.10,
    "margin_protection": 0.10,
    "measurability": 0.10,
    "attribution": 0.08,
    "expansion_alignment": 0.08,
    "buyer_comprehension": 0.07,
    "gaming_resistance": 0.05,
    "operational_simplicity": 0.04,
    "implementation_feasibility": 0.04,
    "refund_tractability": 0.04,
}
```

All criterion functions should return normalized values:

[
s_i(p) in [0,1]
]

---

# 14. Weighted Scoring With Adjustments

Base score:

[
S_0(p)=sum_i w_i s_i(p)
]

Soft-rule adjustment:

[
A(p)=sum_j a_j
]

Final raw score:

[
S_r(p)=S_0(p)+A(p)
]

Clamp to:

[
S(p)=min(1,max(0,S_r(p)))
]

Python:

```python
def score_paradigm(
    paradigm: PricingParadigm,
    profile: BusinessProfile,
    weights: dict[str, float],
) -> float:
    base = sum(
        weights[name] * evaluate_criterion(
            name,
            paradigm,
            profile,
        )
        for name in weights
    )

    adjustment = sum(
        rule.delta
        for rule in evaluate_soft_rules(
            paradigm,
            profile,
        )
    )

    return min(1.0, max(0.0, base + adjustment))
```

---

# 15. Pairwise Dominance

A numeric score alone can hide obvious superiority.

The system can also apply Pareto-style dominance.

Paradigm (p_a) dominates (p_b) if:

[
s_i(p_a) ge s_i(p_b) quad orall i
]

and:

[
exists j : s_j(p_a) > s_j(p_b)
]

A dominated candidate can be de-prioritized even if its aggregate score is close.

This helps prevent arbitrary ranking caused by weight selection.

---

# 16. Paradigm Composition

The engine is not merely choosing one label.

It composes:

[
	ext{Payment Paradigm}
=
	ext{Meter}
+
	ext{Packaging}
+
	ext{Billing}
+
	ext{Overage / Commitment Rules}
]

For example:

```text
Meter:
repositories protected

Packaging:
tiered bundled allowance

Billing:
monthly subscription

Secondary usage meter:
scan volume

Overage:
per additional scan
```

This may correspond to the established family:

```text
Hybrid base + usage
```

Composition must only use compatible combinations defined by the governed catalog.

---

# 17. Compatibility Matrix

Apex should maintain explicit compatibility rules.

Example:

```python
COMPATIBILITY = {
    "per_seat": {
        "meters": {"seat"},
        "packaging": {"flat", "tiered"},
        "billing": {"monthly", "annual"},
    },

    "usage_based": {
        "meters": {
            "api_call",
            "transaction",
            "compute",
            "document",
            "storage",
        },
        "packaging": {
            "flat",
            "bundled_allowance",
        },
        "billing": {
            "postpaid",
            "prepaid",
            "commit_plus_overage",
        },
    },
}
```

The system should reject impossible or unsupported combinations.

---

# 18. Confidence Modeling

A recommendation score and recommendation confidence are not the same thing.

A paradigm can score highly while the underlying input data is uncertain.

Define confidence approximately as:

[
Conf(R)
=
Q_d
cdot
Q_e
cdot
Q_s
]

Where:

- (Q_d) = input-data quality
- (Q_e) = evidence quality
- (Q_s) = score separation / stability

A simple implementation:

[
Q_s = minleft(1,rac{S_1-S_2}{	au}ight)
]

Where:

- (S_1) = best score
- (S_2) = second-best score
- (	au) = separation threshold

If two paradigms are nearly tied, confidence should be lower.

---

# 19. Uncertainty Representation

Founder answers should not always be treated as exact.

Instead of:

```python
usage_variability = 0.8
```

support:

```python
usage_variability = Distribution(
    mean=0.8,
    stddev=0.1,
)
```

or simpler bounded ranges:

```python
usage_variability = Range(
    low=0.6,
    high=0.9,
)
```

This enables uncertainty-aware simulation.

---

# 20. Monte Carlo Simulation

For uncertain inputs, Apex can repeatedly sample plausible business conditions.

For iteration (k):

[
B_k sim D(B)
]

Then calculate:

[
R_k=f(B_k,P,E,C)
]

Run:

[
k=1,ldots,N
]

Then estimate how often each paradigm wins.

Example:

```text
Hybrid base + usage:
82.4%

Pure usage:
11.7%

Tiered subscription:
5.9%
```

This is much more informative than a single deterministic score.

---

# 21. Robustness Score

Define:

[
Robustness(p)
=
rac{	ext{number of simulations where }p	ext{ ranks first}}
{N}
]

A recommendation should not be presented as strongly robust merely because it wins once.

Example:

```text
Recommended:
Hybrid base + usage

Robustness:
0.824

Interpretation:
Hybrid remained the highest-ranked paradigm in 82.4% of plausible scenarios.
```

---

# 22. Sensitivity Analysis

Apex should determine which assumptions most affect the recommendation.

For variable (x_i):

[
Sensitivity_i
=
rac{Delta Score}{Delta x_i}
]

A finite-difference approximation:

[
rac{partial S}{partial x_i}
approx
rac{S(x_i+epsilon)-S(x_i-epsilon)}
{2epsilon}
]

This allows Apex to say:

```text
The recommendation is most sensitive to:

1. customer usage variability
2. infrastructure cost variability
3. buyer need for predictable spending
```

That tells the founder which assumptions deserve validation.

---

# 23. Scenario Analysis

Apex should support explicit scenarios.

Examples:

- low usage
- expected usage
- high usage
- rapid customer growth
- enterprise-heavy mix
- SMB-heavy mix
- infrastructure cost increase
- price sensitivity increase

For scenario (s):

[
R_s=f(B_s,P,E,C)
]

A robust recommendation should survive multiple realistic scenarios.

---

# 24. Revenue Simulation

Once candidate prices exist, Apex can simulate financial behavior.

For customer (i):

[
Revenue_i =
Base_i + Usage_i + Overage_i + Addons_i
]

Total revenue:

[
R=sum_i Revenue_i
]

Gross profit:

[
GP=R-COGS
]

Gross margin:

[
GM=rac{R-COGS}{R}
]

The engine can compare paradigms on:

- revenue
- gross margin
- margin variance
- customer bill variance
- expansion revenue
- concentration risk
- overage dependence

---

# 25. Customer Bill Predictability

A simple metric for bill volatility:

[
CV =
rac{sigma(Bill)}
{mu(Bill)}
]

Where (CV) is the coefficient of variation.

Higher (CV) means less predictable customer bills.

This can be used to compare:

```text
Flat subscription
vs
Usage-based
vs
Hybrid
```

---

# 26. Margin Risk

If vendor cost is variable but revenue is fixed, margin can compress.

Define margin risk approximately as:

[
MR =
Var(COGS - VariableRevenue)
]

or use simulated downside metrics.

For example:

[
P(GM < GM_{min})
]

Where (GM_{min}) is the minimum acceptable gross margin.

This helps identify when unlimited flat-rate plans are economically dangerous.

---

# 27. Optimization Layer

A later version can optimize package parameters.

Decision variables might include:

[
x =
(
price,
included_units,
overage_rate,
tier_thresholds
)
]

Objective:

[
max_x
left[
alpha Revenue(x)
+
eta GrossMargin(x)
+
gamma Predictability(x)
-
delta Complexity(x)
ight]
]

Subject to constraints such as:

[
GrossMargin(x) ge GM_{min}
]

[
CustomerBillShock(x) le B_{max}
]

[
Tier_1 < Tier_2 < Tier_3
]

This could be implemented with:

- scipy.optimize
- linear programming
- mixed-integer optimization
- grid search
- Bayesian optimization

But optimization should come after the core rule engine works.

---

# 28. Bayesian Updating

As Apex accumulates real customer behavior, it can update beliefs.

Suppose initial belief:

[
P(Hybrid is best)=0.60
]

Then observed customer usage data provides evidence (D).

Update using Bayes:

[
P(H|D)
=
rac{P(D|H)P(H)}
{P(D)}
]

This does not require an LLM.

It can improve recommendations as Apex observes:

- usage distributions
- plan upgrades
- overage behavior
- churn
- refunds
- support complaints
- margin erosion

---

# 29. Evidence Governance

The recommendation engine must prove that a paradigm has precedent.

Each source should have quality metadata.

```python
@dataclass
class EvidenceQuality:
    authority: float
    recency: float
    specificity: float
    reproducibility: float
    independence: float
```

Evidence score:

[
E =
w_aA +
w_rR +
w_sS +
w_pP +
w_iI
]

The engine may require:

[
E ge E_{min}
]

before a paradigm can be recommended.

This prevents weak blog content from becoming the sole basis for a commercial recommendation.

---

# 30. Evidence Classes

Suggested evidence classes:

```text
Tier A:
peer-reviewed literature
major payment-platform documentation
recognized pricing research
public filings / official pricing

Tier B:
industry surveys
major consulting research
documented case studies
well-established SaaS guidance

Tier C:
vendor blogs
founder essays
community evidence

Tier D:
anecdotal or unsupported claims
```

Production recommendations should require at least one Tier A or Tier B source.

---

# 31. Explainability Model

Every score adjustment should create a reason object.

```python
@dataclass
class Reason:
    rule_id: str
    criterion: str
    effect: float
    explanation: str
    evidence_ids: list[str]
```

The engine should be able to reconstruct:

```text
Why was Hybrid recommended?

+0.18 strong value alignment
+0.14 strong cost alignment
+0.11 budget predictability
+0.09 margin protection
+0.08 expansion behavior

Why not per-seat?

-0.24 weak correlation between seat count and customer value
```

No LLM is required for this explanation.

---

# 32. Counterfactual Explanation

Apex should answer:

> What would need to change for another paradigm to win?

For candidate (p), find the smallest input change:

[
Delta B^*
=
argmin_{Delta B}
|Delta B|
]

such that:

[
Score_p(B+Delta B)
>
Score_{winner}(B+Delta B)
]

Example:

```text
Per-seat would become competitive if customer value became strongly correlated with active users rather than repository coverage.
```

This is valuable because it explains the boundary between models.

---

# 33. Recommendation Provenance

Every recommendation should include:

```python
@dataclass
class RecommendationProvenance:
    engine_version: str
    rule_set_version: str
    paradigm_catalog_version: str
    evidence_catalog_version: str
    input_hash: str
    generated_at: datetime
```

This allows Apex to reproduce past recommendations exactly.

---

# 34. Recommendation Object

```python
@dataclass
class Recommendation:
    paradigm: PaymentParadigm

    score: float
    confidence: float
    robustness: float

    reasons: list[Reason]
    rejected_paradigms: list["RejectedParadigm"]
    sensitivity: dict[str, float]

    evidence_ids: list[str]
    provenance: RecommendationProvenance
```

---

# 35. Rejected Paradigm Record

Apex should preserve why alternatives lost.

```python
@dataclass
class RejectedParadigm:
    paradigm_id: str
    score: float | None
    hard_constraint_violations: list[str]
    soft_penalties: list[ScoreAdjustment]
```

This is critical for explainability and debugging.

---

# 36. Implementation Pipeline

The Python core can be organized as:

```text
payment_paradigm/
    models/
        business.py
        metrics.py
        paradigms.py
        recommendation.py

    intake/
        schema.py
        normalization.py
        validation.py

    evidence/
        catalog.py
        quality.py
        validators.py

    rules/
        hard_constraints.py
        soft_constraints.py
        compatibility.py

    scoring/
        meter_scoring.py
        paradigm_scoring.py
        weights.py
        dominance.py

    simulation/
        scenarios.py
        monte_carlo.py
        revenue.py
        margin.py
        sensitivity.py

    optimization/
        package_optimizer.py

    explain/
        reasons.py
        counterfactuals.py

    engine.py
```

---

# 37. Core Engine Pseudocode

```python
def recommend_payment_paradigm(
    answers,
    paradigm_catalog,
    evidence_catalog,
):

    profile = normalize_business_profile(answers)

    governed = [
        p for p in paradigm_catalog
        if is_recommendation_eligible(p)
    ]

    value_metrics = rank_value_metrics(
        profile.value_metric_candidates,
        profile,
    )

    cost_metrics = rank_cost_metrics(
        profile.cost_driver_candidates,
        profile,
    )

    feasible = []

    for paradigm in governed:

        violations = hard_constraint_violations(
            profile,
            paradigm,
        )

        if violations:
            continue

        if not is_compatible(
            paradigm,
            value_metrics,
            cost_metrics,
        ):
            continue

        feasible.append(paradigm)

    scored = [
        score_candidate(
            profile,
            paradigm,
            value_metrics,
            cost_metrics,
        )
        for paradigm in feasible
    ]

    ranked = rank(scored)

    composed = compose_payment_paradigm(
        profile=profile,
        ranked=ranked,
        value_metrics=value_metrics,
        cost_metrics=cost_metrics,
    )

    simulation = simulate(
        profile,
        composed,
    )

    confidence = calculate_confidence(
        profile,
        ranked,
        simulation,
    )

    return build_recommendation(
        paradigm=composed,
        ranked=ranked,
        simulation=simulation,
        confidence=confidence,
    )
```

---

# 38. Determinism

Given identical:

- normalized input
- engine version
- rule-set version
- evidence catalog version
- paradigm catalog version

the recommendation should be identical.

Formally:

[
f(x,v)=f(x,v)
]

for fixed input (x) and version state (v).

Monte Carlo simulation should support deterministic seeds for reproducibility.

---

# 39. Testing Strategy

The engine requires several levels of tests.

## Unit tests

Test:

- scoring functions
- normalization
- hard constraints
- soft rules
- compatibility
- confidence
- evidence eligibility

## Property tests

Examples:

```text
A non-measurable outcome can never produce outcome-based pricing.

A paradigm with no valid evidence can never be recommended.

Increasing value correlation should never reduce the meter score when all else is equal.
```

## Golden tests

Known business profiles should generate stable expected recommendations.

## Regression tests

Every discovered recommendation failure becomes a permanent test fixture.

## Simulation tests

Verify:

- seeded reproducibility
- confidence intervals
- scenario stability
- sensitivity outputs

---

# 40. Invariants

Important system invariants:

[
	ext{RecommendedParadigm} subseteq 	ext{GovernedParadigms}
]

[
	ext{HardViolation}(p) Rightarrow p 
otin 	ext{FeasibleSet}
]

[
0 le Score(p) le 1
]

[
0 le Confidence(R) le 1
]

[
0 le Robustness(R) le 1
]

And:

```text
No recommendation without evidence.
No hidden rule without a reason code.
No score without a reproducible calculation.
No unsupported pricing composition.
```

---

# 41. Human Override

The engine should recommend, not dictate.

If a founder chooses another established paradigm:

```python
Override(
    recommended="hybrid_base_plus_usage",
    selected="tiered_subscription",
    reason="sales_process_requires_fixed_contract_value",
)
```

The system should preserve the override.

Apex can then configure infrastructure around the selected model.

---

# 42. Mapping to Apex Enforcement

The end state is not merely a report.

The Payment Paradigm should map to Apex objects.

Example:

```text
Payment Paradigm
        ↓
Stripe Product
        ↓
Stripe Prices
        ↓
Entitlements
        ↓
Usage Meters
        ↓
Credits / Limits
        ↓
Permissions
        ↓
Overages
        ↓
Refund / Reversal Rules
```

A normalized mapping object could look like:

```python
@dataclass
class CommercialImplementationPlan:
    stripe_products: list
    stripe_prices: list
    entitlements: list
    usage_meters: list
    credit_policies: list
    limits: list
    refund_policies: list
    overage_policies: list
```

This is where Payment Paradigm becomes uniquely valuable to Apex.

---

# 43. Why Python Is Sufficient

The core problem is fundamentally composed of:

- classification
- constraint satisfaction
- multi-criteria decision analysis
- numerical optimization
- uncertainty modeling
- Monte Carlo simulation
- sensitivity analysis
- evidence validation
- rule execution
- explainability

These are classical computational problems.

They do not inherently require a language model.

Python is well suited because it can support:

- dataclasses / Pydantic
- NumPy
- SciPy
- pandas
- statistics
- optimization libraries
- probabilistic libraries
- property-based testing
- deterministic rule execution

The sophistication comes from the quality of the ontology, rules, evidence, and mathematical model, not from model size.

---

# 44. Recommended Implementation Order

## Phase 1 — Deterministic Core

Build:

1. `BusinessProfile`
2. `MetricCandidate`
3. governed paradigm catalog
4. hard constraints
5. soft rules
6. weighted scoring
7. explanation objects
8. deterministic recommendation

## Phase 2 — Robustness

Add:

1. uncertainty ranges
2. scenario testing
3. sensitivity analysis
4. Monte Carlo simulation
5. confidence calculation

## Phase 3 — Economics

Add:

1. revenue simulation
2. COGS modeling
3. gross-margin analysis
4. customer bill volatility
5. package parameter optimization

## Phase 4 — Learning From Reality

Add:

1. observed usage distributions
2. actual margins
3. upgrades
4. churn
5. refunds
6. disputes
7. Bayesian updating

## Phase 5 — Optional Language Layer

Only after the deterministic engine is trusted:

1. natural-language intake
2. assisted questionnaire completion
3. plain-English explanation rewriting

The LLM remains a translator, not the economic decision-maker.

---

# 45. Final System Principle

The engineering target is:

> **Given how a product creates customer value, incurs vendor cost, is consumed, and is measured, identify the best-supported established commercial structure and prove why it fits.**

The engine should be able to answer:

```text
What should we meter?
Why?

How should we package it?
Why?

When/how should customers pay?
Why?

What established pricing paradigm does that correspond to?

What evidence proves that paradigm is real and established?

What alternatives were considered?

Why did they lose?

How sensitive is the recommendation to our assumptions?

What happens under low, expected, and high usage?

How do we implement this recommendation in Stripe and Apex?
```

That is the nucleus of Payment Paradigm.
