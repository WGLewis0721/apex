"""Deterministic silent product films. Pillow + FFmpeg; no model-rendered UI.

Usage: python render_film.py PRODUCT --reveal reveal.mp4 --out OUT --fonts FONTS
All pictured records are fictional demonstration fixtures. Coordinates are
authored at 1440x810 and rasterized directly at 3840x2160, including typography.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import argparse, math, subprocess, json

p = argparse.ArgumentParser()
p.add_argument('product', choices=['studigo','apex','fundmatch','porygen','spread'])
p.add_argument('--reveal', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--fonts', type=Path, required=True)
p.add_argument('--stills', action='store_true')
p.add_argument('--width', type=int, default=3840)
a = p.parse_args()
W=a.width; H=round(W*9/16); S=W/1440; FPS=30; DUR=20
OUT=a.out; OUT.mkdir(parents=True,exist_ok=True)
fonts={}
theme={
 'studigo':('#f6f7fb','#172039','#747b90','#315bff','Figtree','Bricolage'),
 'apex':('#f7f2e8','#16243a','#71685c','#315bff','Manrope','Fraunces'),
 'fundmatch':('#191c22','#f8f7f3','#b1b8c3','#a3b2f4','Manrope','InstrumentSerif'),
 'porygen':('#0b0d10','#eeebec','#a0a2a9','#f6ad66','PublicSans','Newsreader'),
 'spread':('#f6f1e7','#171717','#68645d','#0a84ff','Inter','InstrumentSerif'),
}[a.product]
BG,INK,MUTED,ACC,BODY,DISPLAY=theme
def ease(v):
 v=max(0,min(1,v));return 1-(1-v)**3
def smooth(v):
 v=max(0,min(1,v));return v*v*(3-2*v)
def f(n, face=None, weight=500):
 face=face or BODY; key=(n,face,weight)
 if key not in fonts:
  file=a.fonts/(face+'.ttf')
  font=ImageFont.truetype(str(file if file.exists() else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),max(1,round(n*S)))
  try:
   axes=font.get_variation_axes();font.set_variation_by_axes([weight if x['name']==b'Weight' else x['default'] for x in axes])
  except (OSError,AttributeError): pass
  fonts[key]=font
 return fonts[key]
def text(d,x,y,s,n=24,c=None,face=None,weight=500,anchor='la'):
 d.text((round(x*S),round(y*S)),s,font=f(n,face,weight),fill=c or INK,anchor=anchor)
def rr(d,x,y,w,h,c,r=18,line=None):
 d.rounded_rectangle((round(x*S),round(y*S),round((x+w)*S),round((y+h)*S)),radius=round(r*S),fill=c,outline=line,width=max(1,round(S)))
def line(d,points,c,w=1): d.line([(round(x*S),round(y*S)) for x,y in points],fill=c,width=max(1,round(w*S)))
def dot(d,x,y,r,c):d.ellipse((round((x-r)*S),round((y-r)*S),round((x+r)*S),round((y+r)*S)),fill=c)
def check(d,x,y,c='#16836e'):
 line(d,[(x,y+7),(x+6,y+13),(x+20,y)],c,3)
def pill(d,x,y,s,c=ACC,fg=None,w=None):
 w=w or d.textlength(s,font=f(20))/S+34
 rr(d,x,y,w,40,c,20);text(d,x+17,y+8,s,20,fg or INK)
def paper(d,x,y,w,h):
 rr(d,x,y,w,h,'#fffcf6',4,'#dbd5c9')
 for yy in range(round(y+78),round(y+h-16),34):line(d,[(x+20,yy),(x+w-20,yy)],'#dde3e3')
 line(d,[(x+42,y+12),(x+42,y+h-12)],'#debab0')
def panel(d,x=70,y=190,w=1300,h=515,c='#ffffff',border='#dadde7'):
 rr(d,x+4,y+12,w,h,'#00000012',26);rr(d,x,y,w,h,c,26,border)
def row(d,x,y,w,label,value,color='#f3f4f8',ink='#172039'):
 rr(d,x,y,w,70,color,15);text(d,x+22,y+21,label,24,ink,weight=600)
 text(d,x+w-22,y+22,value,24,ink,anchor='ra')
def heading(d,title,tag):
 text(d,72,52,title,62,INK,DISPLAY,600)
 text(d,74,133,tag,23,MUTED)

def studigo(im,t):
 d=ImageDraw.Draw(im); phase=min(6,sum(t>=v for v in [2.5,5,8,11.5,14.5,17.5]))
 titles=['Your class. Your material.','Drop in the guide.','Know what to study.','Ask. Check the source.','Practice what you learned.','See what needs another look.','Your material. One Study Room.']
 heading(d,titles[phase],['A guide you were actually given.','Your files become the study boundary.','Topics drawn from your own guide.','The page behind the answer stays close.','A question, a choice, and a clear response.','Practice evidence points to the next review.','Explain. Practice. Review. All connected.'][phase])
 panel(d,c='#212b42',border='#47536b')
 # Current Study Room's colored shell, rail, mode tabs and source-chip vocabulary.
 rr(d,88,208,1264,66,'#315bff',17)
 text(d,116,223,'studigo',32,'white','Bricolage',700)
 text(d,330,230,'Cell Transport  /  Unit 3',25,'white')
 pill(d,1137,220,'Demo material','#dce5ff','#243861',188)
 for j,(lab,col) in enumerate([('Coach','#fa974e'),('Practice','#c8bcf6'),('Progress','#90d9c5'),('Materials','#a2c7f6')]):
  yy=299+j*78;rr(d,107,yy,187,62,col if (phase in [3,6] and j==0) or (phase==4 and j==1) or (phase==5 and j==2) or (phase<3 and j==3) else '#303b52',16)
  text(d,128,yy+18,lab,25,'#172039' if (phase in [3,6] and j==0) or (phase==4 and j==1) or (phase==5 and j==2) or (phase<3 and j==3) else '#dce1ed',weight=650)
 if phase<2:
  paper(d,375,302,394,350)
  text(d,446,327,'UNIT 3',19,'#596275',weight=700)
  text(d,445,375,'Cell transport',33,'#172039','Bricolage',700)
  text(d,445,440,'Diffusion',24,'#596275');text(d,445,477,'Osmosis',24,'#596275');text(d,445,514,'Active transport',24,'#596275')
  if phase==0:
   text(d,841,346,'Start with your guide.',33,'white','Bricolage',700)
   text(d,841,413,'PDF  ·  Slides  ·  Notes',25,'#bac5dd')
   rr(d,839,491,400,98,'#303c55',17,'#a2b7ff');text(d,867,525,'Bring your class material',26,'#dce5ff',weight=650)
  else:
   rr(d,837,329,416,259,'#edf2ff',24)
   text(d,869,361,'Cell_Transport_Guide.pdf',25,'#172039',weight=650)
   text(d,869,414,'Study guide  ·  3 pages',23,'#687187')
   rr(d,867,469,345,9,'#dbe1f4',4);rr(d,867,469,345*ease((t-2.5)/1.6),9,'#315bff',4)
   if t>4:check(d,871,533);text(d,904,522,'Ready to study',27,'#16836e',weight=650)
 elif phase==2:
  text(d,358,302,'What’s in this room',34,'white','Bricolage',650)
  for j,(lab,sub,col) in enumerate([('Diffusion','Particles spread out.','#ffdbc1'),('Osmosis','Water moves across a membrane.','#d7d5f9'),('Active transport','Movement that needs energy.','#c7eadc')]):
   x=358+j*307;rr(d,x,375,284,214,col,24);text(d,x+22,405,lab,29,'#172039','Bricolage',700)
   parts=sub.split(' ');s=' '.join(parts[:3]);text(d,x+22,469,s,23,'#48526a');text(d,x+22,503,' '.join(parts[3:]),23,'#48526a')
  text(d,363,623,'From Cell_Transport_Guide.pdf',23,'#bdc7dd')
 elif phase in [3,6]:
  x=344;w=977
  text(d,x+20,303,'How is osmosis different?',29,'white',weight=650)
  rr(d,x+10,362,phase==6 and 608 or 940,214,'#fff6ee',22)
  text(d,x+33,385,'Water moves across a membrane.',31,'#172039','Bricolage',650)
  text(d,x+33,433,'That water movement is osmosis.',28,'#465169')
  pill(d,x+33,493,'Guide · page 2','#dce5ff','#315bff',215)
  if phase==3:
   rr(d,x+10,592,940,65,'#364461',16);text(d,x+32,612,'“Osmosis is the diffusion of water…”',27,'#dce5ff')
  else:
   rr(d,981,300,340,174,'#d9d6fa',22);text(d,1004,326,'Practice',32,'#172039','Bricolage',700);text(d,1004,383,'Try the next question',24,'#465169')
   rr(d,981,495,340,166,'#c7eadc',22);text(d,1004,518,'Review next',31,'#172039','Bricolage',700);text(d,1004,579,'Active transport',25,'#465169')
   text(d,365,614,'Your guide is still one tap away.',25,'#bdc7dd')
 elif phase==4:
  text(d,360,301,'PRACTICE  /  FROM YOUR GUIDE',20,'#c8bcf6',weight=700)
  text(d,360,349,'Water crosses a membrane. What is it?',34,'white','Bricolage',650)
  for j,lab in enumerate(['Diffusion','Osmosis','Active transport']):
   y=413+j*73;rr(d,360,y,940,59,'#d9d6fa' if j==1 and t>12.4 else '#303b52',15)
   text(d,385,y+14,lab,27,'#172039' if j==1 and t>12.4 else '#e9ecf5',weight=600)
   if j==1 and t>12.4:check(d,1240,y+21)
  if t>13.2:text(d,360,645,'Yes. Osmosis is water moving across a membrane.',23,'#9de1c9')
 else:
  text(d,360,309,'Your next review',35,'white','Bricolage',700)
  for j,(lab,val,col) in enumerate([('Diffusion','Practiced','#90d9c5'),('Osmosis','Practiced','#c8bcf6'),('Active transport','Review next','#fa974e')]):
   row(d,360,378+j*87,935,lab,val,col)
  text(d,360,647,'Based on practice in this demo room.',23,'#bac5dd')

def apex(im,t):
 d=ImageDraw.Draw(im); phase=min(6,sum(t>=v for v in [2.5,5,8,11.5,14.5,17.5]))
 heading(d,['A payment should unlock something.','Payment received.','100 credits granted.','12 credits used.','One record of what happened.','Why does this customer have access?','Payments in. Product value out.'][phase],['Stripe handles money. APEX connects it to the product.','A received event enters the product lifecycle.','The value is explicit. The action becomes available.','The balance changes with the action.','Payment, grant, and usage stay connected.','The answer is in the linked events.','The customer gets access. Your team gets an explanation.'][phase])
 panel(d,c='#ffffff',border='#d9d5cd')
 text(d,108,218,'APEX',35,'#16243a','Manrope',750);pill(d,1138,215,'Sample events','#eae3f8','#433b69',188)
 line(d,[(90,281),(1347,281)],'#e5e0d7')
 # One causal path — real APEX hosted grant/consume/ledger concepts.
 for j,(lab,col) in enumerate([('Stripe','#c8bcf6'),('APEX','#315bff'),('Your product','#f27649')]):
  x=112+j*417;rr(d,x,311,378,65,col,15);text(d,x+189,328,lab,28,'white' if j==1 else '#16243a',weight=700,anchor='ma')
  if j<2:line(d,[(x+382,343),(x+408,343)],'#315bff',3)
 if phase<3:
  text(d,113,417,'Northstar Demo',34,'#16243a',weight=700)
  text(d,113,475,'Run full analysis',28,'#71685c')
  rr(d,113,540,575,101,'#f6f2ea',20)
  text(d,139,574,'Access active' if phase==2 else 'Waiting for payment' if phase==0 else 'Payment recorded',31,'#16836e' if phase==2 else '#16243a',weight=650)
  rr(d,750,411,555,230,'#eef1ff',22)
  text(d,786,435,'ANALYSIS CREDITS',21,'#647399',weight=700)
  text(d,786,485,'100' if phase==2 else '0',82,'#315bff','Manrope',650)
  text(d,1122,550,'available',25,'#647399')
 elif phase==3:
  text(d,117,418,'Analysis complete',40,'#16243a',weight=700)
  rr(d,115,493,565,145,'#f7f2e8',20);text(d,142,524,'Usage recorded',24,'#71685c');text(d,142,567,'12 analysis credits',33,'#16243a',weight=650)
  rr(d,750,411,555,230,'#eef1ff',22);text(d,786,435,'CREDITS REMAINING',21,'#647399',weight=700)
  number=round(100-12*ease((t-8)/1.2));text(d,786,485,str(number),82,'#315bff','Manrope',650);text(d,1122,550,'of 100',25,'#647399')
 else:
  rows=[('Payment received','Sample · payment event','#c8bcf6'),('100 credits granted','Sample · linked grant','#d9e1ff'),('12 credits consumed','Sample · linked usage','#f6d9c9')]
  for j,(lab,sub,col) in enumerate(rows):
   y=407+j*78;rr(d,113,y,phase==6 and 757 or 1190,65,col,14);dot(d,143,y+32,7,'#315bff');text(d,166,y+17,lab,27,'#16243a',weight=650)
   if phase<6:text(d,1275,y+20,sub,23,'#5a6380',anchor='ra')
  if phase==6:
   rr(d,900,406,402,222,'#16243a',22);text(d,928,431,'Northstar Demo',27,'#c8bcf6',weight=650);text(d,928,478,'88 credits',53,'white',weight=650);text(d,928,554,'Access active',29,'#a9dec9')
  text(d,117,650,'Payment → grant → consume. One hosted state.',24,'#71685c')

def fundmatch(im,t):
 d=ImageDraw.Draw(im);phase=min(6,sum(t>=v for v in [2.5,5.5,8.5,12,15,17.5]))
 heading(d,['Your story is already scattered.','Tell it once.','Match the thesis.','Why this fit.','Get ready for the conversation.','A clearer next conversation.','Great companies. Right investors.'][phase],['The deck. The traction. The company behind them.','One company profile, ready for review.','Stage, sector, and geography come into focus.','Specific reasons. A human decision.','Know what is ready and what needs work.','Review the evidence before the next move.','A company, an investor thesis, and the reasons between them.'][phase])
 panel(d,c='#f8f7f3',border='#868c98')
 text(d,107,215,'fundmatch.',36,'#272b31','Manrope',750);pill(d,1097,215,'Illustrative profiles','#e0e6fa','#596b9a',234)
 line(d,[(93,281),(1349,281)],'#ddded8')
 if phase==0:
  notes=[('Pitch deck','Care delivery, closer to home.'),('Traction note','Seed-stage health software.'),('Raise details','Building in the United States.')]
  for j,(lab,val) in enumerate(notes):
   x=117+j*406;y=323+(j%2)*44;rr(d,x,y,376,251,['#e7eddf','#e0e6fa','#eee4d8'][j],18);text(d,x+24,y+28,lab,29,'#272b31',weight=700)
   words=val.split();text(d,x+24,y+109,' '.join(words[:3]),29,'#67716e','InstrumentSerif');text(d,x+24,y+154,' '.join(words[3:]),29,'#67716e','InstrumentSerif')
  text(d,120,627,'Company-reported facts stay separate from suggestions.',25,'#717b87')
 elif phase<3:
  text(d,118,313,'Northstar Health',47,'#272b31','InstrumentSerif')
  text(d,120,375,'Software for care delivery teams.',27,'#717b87')
  for j,(lab,val) in enumerate([('Stage','Seed'),('Sector','Health software'),('Geography','United States')]):
   row(d,118,437+j*71,586,lab,val,'#e7ebdf','#272b31')
  rr(d,755,321,553,333,'#e0e6fa',22)
  text(d,786,348,'Investor thesis',28,'#596b9a',weight=650)
  if phase==1:
   text(d,786,413,'A profile you can',38,'#272b31','InstrumentSerif');text(d,786,465,'explain once.',38,'#272b31','InstrumentSerif')
   text(d,786,574,'Company-reported · demo data',24,'#677895')
  else:
   for j,(s,v) in enumerate([('Stage','Seed'),('Focus','Health software'),('Region','United States')]):
    y=414+j*65;check(d,790,y+9,'#597957');text(d,830,y,s+': '+v,27,'#272b31')
 elif phase in [3,5,6]:
  rr(d,113,313,499,333,'#e7ebdf',22);text(d,140,340,'Northstar Health',39,'#272b31','InstrumentSerif');text(d,140,410,'Seed',28,'#61705c');text(d,140,461,'Health software',28,'#61705c');text(d,140,512,'United States',28,'#61705c')
  rr(d,661,313,643,333,'#e0e6fa',22);text(d,687,338,'Northline Ventures',39,'#272b31','InstrumentSerif');text(d,689,404,'WHY IT FITS',20,'#596b9a',weight=700)
  for j,lab in enumerate(['Seed-stage mandate','Care-delivery software focus','United States investment scope']):
   yy=447+j*55;check(d,691,yy+7,'#596b9a');text(d,725,yy,lab,25,'#272b31',weight=600)
  if phase>=5:pill(d,139,589,'Review fit','#c6efde','#356449',175)
  text(d,118,659,'Fictional company and investor. Fit is not a funding promise.',23,'#717b87')
 else:
  text(d,115,314,'Fundraising readiness',45,'#272b31','InstrumentSerif')
  for j,(lab,val,col) in enumerate([('Company profile','Ready','#dcebdc'),('Pitch materials','Ready','#dcebdc'),('Financial forecast','Review next','#eee4d8')]):
   row(d,117,400+j*78,1185,lab,val,col,'#272b31')
  text(d,120,655,'Preparation comes before the introduction.',25,'#717b87')

def porygen(im,t):
 d=ImageDraw.Draw(im);phase=min(6,sum(t>=v for v in [2.5,5,8,12,15,17.5]))
 heading(d,['Scan the source.','Look beyond a pattern.','Possible is not proof.','Show me why.','Inspect the context.','Evidence, not a verdict.','Know what PoryGen found.'][phase],['A scoped code-source review, without an account.','Structure. Candidate retrieval. Verification.','Common code should not become an accusation.','Compare the matched region, side by side.','Source, license, version, and scan scope.','Keep ordinary overlap separate from specific evidence.','The source relationship is there to inspect.'][phase])
 panel(d,c='#151a20',border='#34445f')
 text(d,107,215,'PoryGen',37,'#eeebec','Newsreader');pill(d,1151,215,'Sample scan','#26344f','#c9c6c7',169)
 line(d,[(94,281),(1346,281)],'#34445f')
 if phase==0:
  text(d,119,324,'PUBLIC GITHUB REPOSITORY',22,'#a0a2a9',weight=700)
  rr(d,116,389,1184,80,'#0b0d10',12,'#34445f');text(d,141,412,'github.com/example/sample-project',31,'#eeebec')
  pill(d,117,520,'Scan source','#f6ad66','#1b0f04',182)
  text(d,117,615,'JavaScript  /  TypeScript  /  Python',28,'#a0a2a9')
 elif phase==1:
  labels=['Read files','Compare structure','Validate candidates']
  for j,lab in enumerate(labels):
   y=328+j*96;rr(d,117,y,1184,76,'#1c283f',15);text(d,143,y+22,lab,29,'#eeebec',weight=600)
   progress=ease((t-2.5-j*.5)/1.1);rr(d,854,y+34,407,9,'#34445f',4);rr(d,854,y+34,max(1,407*progress),9,'#f6ad66',4)
  text(d,118,638,'Scan completeness and exclusions stay visible.',25,'#a0a2a9')
 elif phase in [2,5]:
  row(d,116,333,1188,'Ordinary utility overlap','Common pattern','#26344f','#c9c6c7')
  row(d,116,435,1188,'Specific matched region','Review suggested','#3a2b1e','#f6ad66')
  text(d,120,555,'A familiar pattern alone is not a strong finding.',31,'#eeebec','Newsreader')
  text(d,120,622,'Open the evidence. Make the decision.',28,'#a0a2a9')
 else:
  # Authored sample snippets, not copied private source or a live third-party finding.
  cols=[(113,'Your file · src/limit.ts'),(724,'Candidate · sample/limit.ts')]
  code=['const retryWindow = 60_000;','const nextAllowed = lastRun + retryWindow;','if (now < nextAllowed) return false;','return recordUsage(now);']
  for x,lab in cols:
   rr(d,x,317,580,261,'#0b0d10',17,'#34445f');text(d,x+22,337,lab,25,'#c9c6c7',weight=650)
   for j,s in enumerate(code):
    yy=397+j*41
    if j in [1,2]:rr(d,x+14,yy-3,550,36,'#3a2b1e',3);line(d,[(x+14,yy-3),(x+14,yy+33)],'#f6ad66',3)
    text(d,x+29,yy,str(14+j),18,'#7d8088');text(d,x+70,yy,s,22,'#f6ad66' if j in [1,2] else '#c9c6c7')
  text(d,119,608,'Sample source · MIT',25,'#c9c6c7');text(d,577,608,'Version · demo-1',25,'#c9c6c7');text(d,965,608,'Scope · 1 file',25,'#c9c6c7')
  text(d,119,657,'Illustrative evidence. No claim of global originality.',23,'#a0a2a9')

def spread(im,t):
 d=ImageDraw.Draw(im);phase=min(6,sum(t>=v for v in [2.5,5,8,11.5,14.5,17.5]))
 heading(d,['Start with what matters.','Choose your roles.','Give them real time.','See the shape of your week.','Then add the tasks.','Plan privately. Keep it yours.','A little room for what matters.'][phase],['Your week starts with responsibilities.','Work. Home. Health. Family.','A time budget before a task list.','Put the hours on real days.','The tasks land inside time you have set aside.','No account. Your planner stays on this device.','Roles first. Hours second. Tasks last.'][phase])
 panel(d,c='#0b0b0c',border='#3a3a3d')
 text(d,112,216,'spread',37,'#f2f2f7','Inter',650);pill(d,1135,215,'Sample week','#343435','#e4e4e7',188)
 roles=[('Work',8,'#34c759','Project notes'),('Home',3,'#ff9500','Groceries'),('Health',2,'#0a84ff','Walk'),('Family',2,'#af52de','Read together')]
 if phase==0:
  paper(d,130,307,491,339);text(d,205,326,'Sunday plan',40,'#171717','InstrumentSerif')
  for j,(lab,n,col,task) in enumerate(roles):text(d,205,401+j*49,lab,30,'#68645d','InstrumentSerif')
  text(d,712,362,'Responsibilities',36,'#f2f2f7',weight=650);text(d,712,420,'Hours',36,'#8d8d92');text(d,712,478,'Week',36,'#8d8d92');text(d,712,536,'Tasks',36,'#8d8d92')
 elif phase<3:
  for j,(lab,n,col,task) in enumerate(roles):
   x=114+(j%2)*613;y=317+(j//2)*174;rr(d,x,y,580,144,'#1c1c1e',22,'#3a3a3d');dot(d,x+28,y+35,8,col);text(d,x+49,y+17,lab,30,'#f2f2f7',weight=650)
   if phase==2:
    text(d,x+541,y+22,f'{n}h',29,'#f2f2f7',anchor='ra')
    for k in range(8):rr(d,x+25+k*64,y+89,52,20,col if k<n and t>5+k*.15 else '#3a3a3d',6)
   else:text(d,x+26,y+85,'Give this role some time',25,'#8d8d92')
  text(d,118,662,'15 hours across four responsibilities.' if phase==2 else 'The roles stay yours.',25,'#8d8d92')
 else:
  for j,(lab,n,col,task) in enumerate(roles):
   x=114+(j%2)*613;y=312+(j//2)*168;rr(d,x,y,580,149,'#1c1c1e',22,'#3a3a3d');dot(d,x+28,y+32,8,col);text(d,x+48,y+15,lab,29,'#f2f2f7',weight=650);text(d,x+548,y+18,f'{n}h',29,'#f2f2f7',anchor='ra')
   text(d,x+25,y+60,['Mon 4h · Tue 4h','Wed 3h','Thu 2h','Sun 2h'][j],25,'#b7b7bd')
   if phase>=4:
    rr(d,x+22,y+104,537,31,'#303033',8);dot(d,x+39,y+120,5,col);text(d,x+56,y+105,task,23,'#f2f2f7')
  text(d,118,667,'15h planned  /  168h in your week',25,'#b7b7bd')
  if phase>=5:text(d,1325,667,'On this device',25,'#b7b7bd',anchor='ra')

draw_product={'studigo':studigo,'apex':apex,'fundmatch':fundmatch,'porygen':porygen,'spread':spread}[a.product]

# Cache factual screen states at master resolution. Motion is then deterministic,
# with the same surface gliding through changes rather than unrelated title cards.
def make_content(t):
 im=Image.new('RGBA',(W,H));draw_product(im,t)
 return im

def frame(t,reveal=None):
 base=Image.new('RGB',(W,H),BG)
 if reveal is not None and t>=15:
  # Generated photography stays behind crisp, truthful type and UI.
  photo=reveal.resize((W,H),Image.Resampling.LANCZOS)
  cinematic=1-smooth((t-17.15)/.65)
  base=Image.blend(base,photo,(.16+.84*cinematic)*ease((t-15)/.45))
 current=make_content(t)
 # Content settles gently. No decorative looping or abrupt camera shakes.
 boundaries=[0,2.5,5,8,11.5,14.5,17.5] if a.product!='fundmatch' else [0,2.5,5.5,8.5,12,15,17.5]
 latest=max(x for x in boundaries if t>=x)
 local=t-latest
 if latest>0 and local<.45:
  previous=make_content(latest-.001)
  alpha=smooth(local/.45)
  previous=Image.blend(previous,current,alpha)
  base.paste(previous,(0,round(9*S*(1-alpha))),previous)
 else:base.paste(current,(0,round(9*S*(1-ease(local/.6)))),current)
 if reveal is not None and 15.5<t<17.5:
  # Two seconds of tactile visual breathing room precede the final complete UI.
  # This is a materials shot, never a purported generated product interface.
  blend=ease((t-15.5)/.35)*(1-smooth((t-17.15)/.35))
  base=Image.blend(base,photo,.94*blend)
 d=ImageDraw.Draw(base)
 # An editorial chapter rail is the persistent timeline, not a fake app control.
 stages={'studigo':['Guide','Topics','Coach','Practice','Review'],'apex':['Payment','Grant','Usage','Ledger','Access'],'fundmatch':['Profile','Thesis','Reasons','Readiness','Review'],'porygen':['Scan','Compare','Narrow','Evidence','Context'],'spread':['Roles','Hours','Week','Tasks','Your plan']}[a.product]
 for j,label in enumerate(stages):
  x=74+j*263;active=t>=j*3.5;line(d,[(x,739),(x+232,739)],ACC if active else ('#394253' if a.product in ['porygen','fundmatch'] else '#d1d0cc'),3)
  text(d,x,755,label,21,INK if active else MUTED,weight=600)
 return base

if a.stills:
 for t in [1.5,4,6.5,9.5,13,16,19.9]:
  frame(t).resize((1440,810)).save(OUT/f'{a.product}-{t}.jpg',quality=93)
 raise SystemExit()

decode=subprocess.Popen(['ffmpeg','-v','error','-threads','1','-i',str(a.reveal),'-vf',f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps=30','-t','5','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
master=OUT/f'{a.product}-4k.mp4'
enc=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','30','-i','-','-an','-c:v','libx264','-preset','fast','-crf','17','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',str(master)],stdin=subprocess.PIPE)
photo=None
for i in range(FPS*DUR):
 t=i/FPS
 if i>=450:
  raw=decode.stdout.read(W*H*3)
  if len(raw)==W*H*3:photo=Image.frombytes('RGB',(W,H),raw)
 image=frame(t,photo)
 if i==599:image.resize((1440,810),Image.Resampling.LANCZOS).save(OUT/f'{a.product}-product-film-v2.webp',quality=90)
 enc.stdin.write(image.tobytes())
 if i%150==0:print(f'{a.product}: {i//30}/20 seconds',flush=True)
enc.stdin.close()
if enc.wait():raise RuntimeError('Master encoding failed')
decode.stdout.close();decode.wait()
web=OUT/f'{a.product}-product-film-v2.mp4'
subprocess.run(['ffmpeg','-y','-v','error','-i',str(master),'-vf','scale=1440:810:flags=lanczos','-an','-c:v','libx264','-preset','slow','-crf','22','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',str(web)],check=True)
print(json.dumps({'master':str(master),'web':str(web),'web_bytes':web.stat().st_size,'width':W,'fps':FPS,'duration':DUR}),flush=True)
