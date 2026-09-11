// Shared control-center layout primitives: markup and class names only.
// No host access, no persisted state; native <details> supplies the folding.
export function uiNode(doc,tag,text,parent,className){
  const el=doc.createElement(tag);
  if(text!==undefined&&text!==null)el.textContent=text;
  if(className)el.className=className;
  parent?.append(el);
  return el;
}

// Collapsible titled card. Returns the body element that receives the content.
export function uiCard(doc,parent,{title,hint='',step='',open=false}={}){
  const card=uiNode(doc,'details',undefined,parent,'ls-card');card.open=open;
  const head=uiNode(doc,'summary',undefined,card);
  const row=uiNode(doc,'span',undefined,head,'ls-card-row');
  if(step)uiNode(doc,'span',String(step),row,'ls-step');
  uiNode(doc,'span',title,row,'ls-card-title');
  uiNode(doc,'span','▾',row,'ls-chevron').setAttribute('aria-hidden','true');
  if(hint)uiNode(doc,'span',hint,head,'ls-hint');
  return uiNode(doc,'div',undefined,card,'ls-card-body');
}

// Secondary explanation inside a card; never carries controls.
export function uiNote(doc,parent,text){return uiNode(doc,'p',text,parent,'ls-note');}

// Sub-heading inside a card, for groups too small to deserve their own card.
export function uiHeading(doc,parent,text){return uiNode(doc,'h4',text,parent,'ls-subhead');}

// One row of related buttons, so actions stay next to the fields they apply to.
export function uiActions(doc,parent,items=[]){
  const row=uiNode(doc,'div',undefined,parent,'ls-actions');
  for(const item of items.filter(Boolean))row.append(item);
  return row;
}

// Field group: side by side when there is room, single column on phones.
export function uiGrid(doc,parent,items=[]){
  const grid=uiNode(doc,'div',undefined,parent,'ls-grid');
  for(const item of items.filter(Boolean))grid.append(item);
  return grid;
}
