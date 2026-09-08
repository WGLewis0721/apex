"""Render the APEX 36-second silent product film from precise, readable UI primitives.
Requires Pillow and ffmpeg. All companies and transactions shown are demo fixtures.
No external media, fonts, stock footage, voice, or music licenses are required.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math, subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
W, H, FPS, DURATION = 1440, 810, 24, 36
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
fonts = {}
def f(size, bold=False, mono=False):
    key = (size, bold, mono)
    if key not in fonts: fonts[key] = ImageFont.truetype(MONO if mono else BOLD if bold else FONT, size)
    return fonts[key]
def ease(x):
    x = max(0, min(1, x)); return x*x*(3-2*x)
def txt(d, xy, text, size=18, color='#262630', bold=False, anchor=None, mono=False):
    d.text(xy, text, font=f(size,bold,mono), fill=color, anchor=anchor)
def rr(d, box, fill, r=14, outline=None, width=1):
    d.rounded_rectangle(tuple(round(x) for x in box), radius=r, fill=fill, outline=outline, width=width)
def check(d,x,y,c='#0f9278',s=1):
    d.line([(x,y+5*s),(x+4*s,y+9*s),(x+12*s,y)],fill=c,width=max(2,int(2*s)))
def button(d,box,label,accent='#635bff',size=15):
    rr(d,box,accent,r=9); txt(d,((box[0]+box[2])/2,(box[1]+box[3])/2),label,size,'white',True,'mm')
def cursor(d,x,y,click=0):
    if click:
        r=12+22*click
        d.ellipse((x-r,y-r,x+r,y+r),outline='#b1abff',width=2)
    points=[(x,y),(x+3,y+25),(x+10,y+18),(x+17,y+31),(x+23,y+28),(x+16,y+15),(x+26,y+14)]
    d.polygon(points,fill='white',outline='#363646',width=2)
def event_card(im,title,detail,kind='ok',x=117,y=619,width=590):
    d=ImageDraw.Draw(im); rr(d,(x,y,x+width,y+65),'#24252f',13,'#3e3f4b')
    d.ellipse((x+19,y+23,x+36,y+40),fill='#103f35' if kind=='ok' else '#4e3821')
    if kind=='ok': check(d,x+22,y+26,'#63d9b4',.7)
    else: txt(d,(x+28,y+31),'!',12,'#ffbd72',True,'mm')
    txt(d,(x+49,y+14),title,12,'#efeff8',True,mono=True)
    txt(d,(x+49,y+36),detail,12,'#9293a4')

def app_screen(used=0, subscribed=True, pro=False, accent='#635bff', brand='Forma', dark=False, blocked=False, generated=False):
    im=Image.new('RGBA',(1010,470),(0,0,0,0)); d=ImageDraw.Draw(im)
    bg='#191a20' if dark else '#ffffff'; ink='#efeff6' if dark else '#262630'; muted='#9798a7' if dark else '#92929e'; line='#343541' if dark else '#e8e8f0'; subtle='#24252f' if dark else '#f8f8fb'
    rr(d,(0,0,1009,469),bg,20,line)
    rr(d,(27,18,59,50),accent,9); txt(d,(43,34),'F',20,'white',True,'mm')
    txt(d,(69,34),brand,23,ink,True,'lm')
    txt(d,(645,34),'Workspace',12,ink,anchor='lm'); txt(d,(744,34),'Billing',12,muted,anchor='lm')
    rr(d,(949,21,977,49),subtle,14,line);txt(d,(963,35),'JL',10,muted,anchor='mm')
    d.line((0,68,1010,68),fill=line)
    txt(d,(35,92),'ACME STUDIO',10,muted,True)
    txt(d,(35,115),'A little more possibility.',30,ink,True)
    txt(d,(35,156),'Turn your next idea into something great.',13,muted)
    rr(d,(35,193,620,403),subtle,16,line)
    txt(d,(57,209),'✦',30,accent)
    txt(d,(102,216),'What will you create?',19,ink,True)
    txt(d,(58,256),'Write a launch announcement for our new design studio.',14,muted)
    txt(d,(58,285),'250 tokens / generation',11,muted)
    button(d,(58,322,597,366),'Try at the limit' if blocked else 'Generate content',accent)
    if generated: txt(d,(58,379),'✓  Your new announcement is ready.',11,accent)
    rr(d,(655,93,975,431),bg,15,line)
    txt(d,(678,115),'Pro plan' if pro else 'Starter plan',14,ink,True)
    rr(d,(880,111,953,134),subtle,12);txt(d,(916,122),'Active' if subscribed else 'Preview',10,muted,anchor='mm')
    txt(d,(678,153),'$79' if pro else '$29',42,ink,True)
    txt(d,(781,178),'/ month',12,muted)
    limit=5000 if pro else 1000
    txt(d,(678,210),f'{limit:,} tokens included',12,muted)
    d.line((678,242,950,242),fill=line)
    txt(d,(678,258),'Tokens remaining',12,muted)
    txt(d,(950,264),f'{max(0,limit-used) if subscribed else 0:,}',24,ink,True,'rm')
    rr(d,(678,291,950,297),line,3)
    if used: rr(d,(678,291,678+max(4,272*min(1,used/limit)),297),'#d89349' if blocked else accent,3)
    txt(d,(678,309),f'{used:,} used',10,muted);txt(d,(950,309),f'{limit if subscribed else 0:,} total',10,muted,anchor='ra')
    button(d,(678,340,950,381),'You’re on Pro' if pro else 'Upgrade to Pro' if subscribed else 'Subscribe · $29 / mo',accent,13)
    txt(d,(814,406),'Powered by APEX',9,muted,anchor='mm')
    txt(d,(35,433),'●  Token limit reached. Upgrade to keep creating.' if blocked else '●  Connected to APEX · payments and usage stay in sync',11,'#b97828' if blocked else muted)
    return im

def connect_screen(t):
    im=Image.new('RGBA',(1010,470),(0,0,0,0));d=ImageDraw.Draw(im)
    rr(d,(0,0,1009,469),'#fff',20,'#e4e4ef');txt(d,(35,28),'APEX',24,'#242430',True);txt(d,(155,36),'Configure your product',13,'#92929d')
    d.line((0,75,1010,75),fill='#ececf3')
    txt(d,(36,94),'A few details. Everything connected.',29,'#25252f',True)
    txt(d,(36,138),'Your billing provider. Your plans. Your product.',14,'#9898a5')
    rr(d,(35,184,485,423),'#f8f8fc',15,'#e7e7f0');txt(d,(58,206),'PAYMENT PROVIDER',11,'#8e8e9d',True)
    rr(d,(58,241,462,305),'white',10,'#e2e2ed');txt(d,(78,258),'stripe',23,'#635bff',True)
    ready=t>2.5
    txt(d,(434,272),'Connected' if ready else 'Connect account',13,'#07866a' if ready else '#777784',anchor='rm')
    if ready: check(d,342,265)
    txt(d,(58,332),'Subscriptions and payment events',14,'#51515e');txt(d,(58,361),'Ready for your customer experience.',12,'#9696a5')
    rr(d,(513,184,975,423),'#f8f8fc',15,'#e7e7f0');txt(d,(536,206),'PRODUCT PLAN',11,'#8e8e9d',True)
    txt(d,(538,244),'Starter',22,'#282833',True);txt(d,(951,253),'$29 / month',19,'#282833',True,'rm')
    d.line((537,286,951,286),fill='#e2e2ed');txt(d,(538,307),'AI tokens included',14,'#777785');txt(d,(951,307),'1,000',17,'#635bff',True,'ra')
    button(d,(536,357,951,395),'Configuration ready' if t>4 else 'Save plan','#635bff',13)
    return im

def frame(t):
    im=Image.new('RGB',(W,H),'#101117');d=ImageDraw.Draw(im)
    # These are precise UI diagrams and readable typography, not generated screen footage.
    if t<6: title='A few details. Ready to earn.'; sub='Connect payments. Configure a plan.'; app=connect_screen(t);local=t;scene=0
    elif t<12: title='Paid. And ready to create.';sub='A subscription becomes access. Automatically.';local=t-6;scene=1;app=app_screen(subscribed=local>2)
    elif t<21:
        local=t-12;scene=2; used=min(1000,int(local//1.7)*250);blocked=local>7.3
        title='Every token. Accounted for.' if not blocked else 'A clear limit. A simple next step.'
        sub='Usage updates as your customer creates.' if not blocked else 'No balance left. No extra usage charged.'
        app=app_screen(used=used,blocked=blocked,generated=used>0)
    elif t<28:
        local=t-21;scene=3;upgraded=local>2
        title='More room for the next big idea.';sub='Upgrade the plan. Keep creating.'
        app=app_screen(used=1250 if local>4.8 else 1000,pro=upgraded,blocked=not upgraded,generated=True)
    else:
        local=t-28;scene=4
        title='Your app. Your brand. APEX underneath.';sub='Style it once. Make it feel completely yours.'
        forest=local>2.3;dark=local>5
        app=app_screen(used=1250,pro=True,accent='#087f64' if forest else '#635bff',brand='studio' if forest else 'Forma',dark=dark,generated=True)
    # Deliberate scene entrances, subtle product movement; no flashing or rapid cuts.
    shift=round((1-ease(local/.85))*18)
    txt(d,(720,91+shift),title,39,'#f7f7fc',True,'mm')
    txt(d,(720,139+shift),sub,17,'#898b9b',anchor='mm')
    scale=1+0.012*ease(local/7)
    aw,ah=round(1010*scale),round(470*scale)
    app=app.resize((aw,ah),Image.Resampling.LANCZOS)
    ax=(W-aw)//2;ay=190+shift
    # Product-stage shadow.
    rr(d,(ax-3,ay+8,ax+aw+3,ay+ah+9),'#07080c',25)
    im.paste(app,(ax,ay),app)
    d=ImageDraw.Draw(im)
    if scene==0:
        if 1<t<3.4: cursor(d,ax+390,ay+283,1-abs(t-2.5)/.4 if abs(t-2.5)<.4 else 0)
        if t>4.2: event_card(im,'configuration.ready','Stripe connected · Starter includes 1,000 tokens',x=405,y=684,width=630)
    elif scene==1:
        if .8<local<3: cursor(d,ax+838,ay+362,1-abs(local-2)/.4 if abs(local-2)<.4 else 0)
        if local>2: event_card(im,'payment.succeeded','$29.00 received · Starter access activated',x=405,y=684,width=630)
    elif scene==2:
        if local<7.3:
            pulse=(local%1.7)
            cursor(d,ax+425,ay+345,1-abs(pulse-.03)/.25 if pulse<.28 else 0)
            if used: event_card(im,'usage.recorded',f'{used:,} of 1,000 tokens used · balance updated',x=405,y=684,width=630)
        else: event_card(im,'usage.blocked','Limit reached · 0 additional tokens charged','warn',x=405,y=684,width=630)
    elif scene==3:
        if .6<local<3: cursor(d,ax+830,ay+361,1-abs(local-2)/.4 if abs(local-2)<.4 else 0)
        if local>2: event_card(im,'plan.upgraded','Pro activated · 5,000-token allowance · usage preserved',x=365,y=684,width=710)
    else:
        colors=['#635bff','#087f64','#006fe8','#252529']
        for i,c in enumerate(colors):
            x=645+i*48;d.ellipse((x,699,x+25,724),fill=c)
            if i==(1 if local>2.3 else 0):d.ellipse((x-4,695,x+29,728),outline='#c9c9d6',width=1)
        if 1.4<local<3.5:cursor(d,704,710,1-abs(local-2.3)/.3 if abs(local-2.3)<.3 else 0)
    txt(d,(720,780),'APEX  /  PRODUCT WALKTHROUGH  /  SIMULATED DATA',8,'#606271',anchor='mm')
    return im

# Poster shows the real product subject immediately, even without autoplay.
frame(15.7).save(OUT/'apex-film-poster.jpg',quality=92,optimize=True)
proc=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'apex-product-film.mp4')],stdin=subprocess.PIPE)
for i in range(DURATION*FPS):
    proc.stdin.write(frame(i/FPS).tobytes())
    if i%144==0: print(f'Rendered {i//FPS}/{DURATION}s',flush=True)
proc.stdin.close()
if proc.wait(): raise RuntimeError('Video encoder failed')
print(f'Film ready: {(OUT / "apex-product-film.mp4").stat().st_size:,} bytes',flush=True)
