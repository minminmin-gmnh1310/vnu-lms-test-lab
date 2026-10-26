/* Only observed LMS text/DOM is used; no application state or progress API. */
const VnuLms = (() => {
  'use strict';
  const normalize = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  const key = value => normalize(value).toLocaleLowerCase('vi');
  const titleText = value => {
    if (value && typeof value.cloneNode === 'function') {
      const copy = value.cloneNode(true);
      for (const marker of copy.querySelectorAll('.content-required,.content-status-box')) marker.remove();
      value = copy.textContent;
    }
    return normalize(value).replace(/\s*[*★]+\s*$/u, '').trim();
  };
  const titleKey = value => key(titleText(value).replace(/[\u200b\ufeff\u00ad]/gu, '')).replace(/^[^\p{L}\p{N}]+/u, '');
  const headingTitle = element => {
    const copy = element.cloneNode(true);
    // Native heading appends a nested span with (course title). Strip that
    // metadata, preserving parentheses that are part of the lesson's own text.
    for (const child of [...copy.children])
      if (child.tagName === 'SPAN' && /^\(.*\)$/u.test(normalize(child.textContent))) child.remove();
    return titleText(copy);
  };
  const headingMatches = (element,title) => {
    const actual=headingTitle(element),expected=titleKey(title);
    return titleKey(actual)===expected || actual.split(/\s+»\s+/u)
      .some((_,index,parts)=>index>0 && titleKey(parts.slice(index).join(' » '))===expected);
  };
  const required = element => !!element.querySelector('.content-required') || /[*★]\s*$/u.test(normalize(element.textContent));
  const kind = title => /^video(?:\s*\d+)?\s*:|^học liệu\s*\d+\s*\(video\)\s*:/iu.test(titleText(title)) ? 'video'
    : /khảo sát|bài kiểm tra|bài tập|trắc nghiệm|thảo luận|nhật ký học tập|\breflection\b|\bquiz\b|\bexam\b/iu.test(titleText(title)) ? 'interactive' : 'page';
  const cells = row => [...row.children].filter(e => /^(TD|TH)$/.test(e.tagName));
  const number = value => {
    const text = normalize(value).replace(',', '.');
    const parsed = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  };
  const headers = ['Tên', 'Điều kiện hoàn thành', 'Điểm số', 'Hệ số',
    'Tổng thời gian truy cập (phút)', 'Tổng số lượt xem', 'Trạng thái'];
  function progress(document, visible) {
    const matches = [...document.querySelectorAll('table')].map(table => {
      if (!visible(table)) return null;
      const rows = [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
      const header = rows.find(row => {
        const columns = cells(row);
        return columns.length === headers.length && columns.every((e, i) => key(e.textContent) === key(headers[i]));
      });
      return header ? {rows, header} : null;
    }).filter(Boolean);
    if (!matches.length) return {kind: 'missing'};
    if (matches.length !== 1) return {kind: 'ambiguous'};
    const items = [];
    let afterHeader = false, section = null;
    for (const row of matches[0].rows) {
      if (row === matches[0].header) {afterHeader = true; continue;}
      if (!afterHeader) continue;
      const columns = cells(row);
      if (!columns.length) continue;
      const name = titleText(columns[0]);
      const mandatory = required(columns[0]);
      // Folders have no conditions, counters or reported status. Leaf names
      // are unrestricted: required announcements and numbered videos count.
      if (columns.slice(1).every(c => !normalize(c.textContent))) {
        if (mandatory) return {kind:'invalid',message:'Mục có sao đỏ thiếu dữ liệu tiến trình: '+name};
        if (name) section = name;
        continue;
      }
      if (columns.length !== headers.length) return {kind: 'invalid', message: 'Hàng nội dung trong bảng tiến trình thiếu cột.'};
      const title = name, statusText = normalize(columns[6].textContent);
      const status = key(statusText) === key('Đã hoàn thành') ? 'complete'
        : key(statusText) === key('Chưa hoàn thành') ? 'incomplete' : 'unknown';
      const requirement = normalize(columns[1].textContent).match(/Phải học tối thiểu\s*(\d+(?:[.,]\d+)?)\s*\(phút\)/iu);
      items.push({title, key:JSON.stringify([titleKey(section),titleKey(title)]), status, statusText, section, required:mandatory, kind:kind(title),
        requiredMinutes: requirement ? number(requirement[1]) : null,
        minutes: number(columns[4].textContent), views: number(columns[5].textContent)});
    }
    if (!items.length) return {kind: 'empty'};
    const titleCounts=new Map(), identities=new Map();
    for (const item of items) {
      const name=titleKey(item.title);
      titleCounts.set(name,(titleCounts.get(name) || 0)+1);
      identities.set(item.key,(identities.get(item.key) || 0)+1);
    }
    const occurrences=new Map();
    for (const item of items) {
      item.titleDuplicate=titleCounts.get(titleKey(item.title))>1;
      item.ambiguous=identities.get(item.key)>1;
      if (item.ambiguous) {
        const occurrence=(occurrences.get(item.key) || 0)+1;
        occurrences.set(item.key,occurrence);
        // Keep report/clock records distinct; occurrence is never a click rule.
        item.key+='|ambiguous:'+occurrence;
      }
    }
    // Live counters can change every tick. Wait for stable rows/conditions/status,
    // while reading the latest minutes and views from the current report.
    const signature = JSON.stringify(items.map(v => [v.key, v.status, v.statusText, v.required, v.kind, v.requiredMinutes, v.section,v.titleDuplicate,v.ambiguous]));
    return {kind: 'ready', items, requiredItems:items.filter(v=>v.required), videos:items.filter(v=>v.kind==='video'), signature};
  }
  function firstPending(items) {
    for (const item of items) {
      if (item.status === 'complete') continue;
      if (item.ambiguous) return {kind:'ambiguous',item};
      if (item.status === 'incomplete') return {kind: 'target', item};
      return {kind: 'unknown', item};
    }
    return {kind: 'done'};
  }
  function disabled(element) {
    for (let node = element; node && node.tagName !== 'BODY'; node = node.parentElement) {
      if (node.disabled || node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('inert') ||
          node.classList.contains('disabled')) return true;
    }
    return false;
  }
  function tabs(document, title, visible) {
    // Keep the innermost actual control when role=tab contains an anchor.
    let matches = [...document.querySelectorAll('a,button,[role="tab"]')]
      .filter(e => key(e.textContent) === key(title) && visible(e));
    // Older Angular menus sometimes place the click handler on a plain label.
    // Click its text only when no semantic control exists, still requiring one
    // exact, visible label; the native click bubbles to the application's handler.
    if (!matches.length) matches = [...document.querySelectorAll('li,div,span')]
      .filter(e => key(e.textContent) === key(title) && visible(e));
    return matches.filter(e => !matches.some(other => other !== e && e.contains(other)));
  }
  function tab(document, title, visible, alreadyOpen) {
    if (alreadyOpen) return 'active';
    const matches = tabs(document, title, visible);
    if (!matches.length) return 'missing';
    if (matches.length !== 1) return 'ambiguous';
    if (disabled(matches[0])) return 'disabled';
    matches[0].click(); return 'clicked';
  }
  function links(document, title) {
    const sidebar = document.getElementById?.('tnContentList');
    const nativeSidebar=sidebar || document.closest?.('#tnContentList');
    return [...(sidebar || document).querySelectorAll('a')].filter(a => {
      const href=normalize(a.getAttribute('href'));
      const native=a.parentElement?.matches('.__lesson-name') &&
        ![...a.parentElement.children].some(e=>e.matches('span.arrow'));
      // Support nested native labels without href only in a leaf
      // heading of the LMS sidebar, never folder titles or external links.
      const control=/^javascript:\s*void\s*\(\s*0\s*\)\s*;?$/iu.test(href) ||
        nativeSidebar && native && (!href || href==='#' || /^javascript:\s*;?$/iu.test(href));
      return control &&
      (title ? titleKey(a) === titleKey(title) : nativeSidebar ? !!titleText(a)
        : kind(titleText(a))==='video' || required(a) || !!a.closest('.__lesson-name,.__lesson-name-child'));
    });
  }
  function linkSections(link, sidebar) {
    const sections=[];
    for (let node=link.parentElement;node && node!==sidebar;node=node.parentElement) {
      // Native expanded folders put their own heading beside the descendant
      // content subtree. Do not read headings from unrelated nested folders.
      const heads=[...node.children].filter(e=>e.matches('.__lesson-name,.__lesson-name-child') &&
        [...e.children].some(child=>child.matches('span.arrow')) && !e.contains(link));
      if (heads.length===1) sections.push(titleKey(heads[0].querySelector('a')));
    }
    return sections;
  }
  function itemLinks(document,title,options={}) {
    const matches=links(document,title);
    if (!options.section) return options.titleDuplicate ? [] : matches;
    const sidebar=document.getElementById?.('tnContentList');
    const scoped=matches.filter(a=>linkSections(a,sidebar).includes(titleKey(options.section)));
    return scoped.length || options.titleDuplicate ? scoped : matches;
  }
  function selected(document, title, visible, options={}) {
    const matches = itemLinks(document, title, options).filter(visible);
    if (matches.length !== 1) return false;
    const a = matches[0];
    if (['true', 'page'].includes(a.getAttribute('aria-current')) ||
        a.getAttribute('aria-selected') === 'true' || a.classList.contains('active') || a.classList.contains('selected')) return true;
    const lesson = a.closest('.__lesson-name,.__lesson-name-child');
    if (lesson?.classList.contains('content-selected') && links(lesson).length === 1) return true;
    const li = a.closest('li');
    if (li && (li.classList.contains('active') || li.classList.contains('selected')) &&
        links(li).length === 1) return true;
    const plainTitle = titleKey(title.replace(/^video(?:\s*\d+)?\s*:\s*/iu, ''));
    // Public LMS template: the first span contains viewing.title; the separate
    // second span is the course title. Do not match a sidebar/body paragraph.
    const nativeHead = document.querySelectorAll('#tnContentView .headcontent .col-md-10 > span');
    // An identical title in the viewer cannot distinguish two different folders.
    if (options.titleDuplicate) return false;
    if ([...nativeHead].some(e=>e.id!=='tnContentButton' && visible(e) && headingMatches(e,title))) return true;
    return [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].some(h => visible(h) &&
      (titleKey(h) === titleKey(title) || titleKey(h) === plainTitle));
  }
  function viewerMatches(document, title, visible) {
    const container=document.getElementById('tnContentView');
    return !!container && visible(container) && [...container.querySelectorAll('.headcontent .col-md-10 > span,h1,h2,h3,h4,h5,h6')]
      .some(e=>e.id!=='tnContentButton' && visible(e) && headingMatches(e,title));
  }
  function pageSnapshot(document, title, visible, interactive = false) {
    const container=document.getElementById('tnContentView');
    if (!container || !visible(container)) return null;
    const heads=[...container.querySelectorAll('.headcontent .col-md-10 > span,h1,h2,h3,h4,h5,h6')]
      .filter(e=>e.id!=='tnContentButton' && visible(e) && headingTitle(e));
    const head=title ? heads.find(e=>headingMatches(e,title)) : heads[0];
    if (title && !head) return null;
    const element=container.querySelector('#TNContentView');
    if (!element || element.tagName==='VIDEO' || !visible(element)) {
      // Surveys/tests have their own components, rather than a native viewer.
      // Open and hand off; never click answers or infer that submission occurred.
      const app=container.querySelector('app-class-content-view');
      const control=app?.querySelector('app-class-content-survey,form,input,textarea,select');
      return interactive && app && visible(app) && control && visible(control)
        ? {element:app,marker:titleKey(title || (head && headingTitle(head))),clockMarker:titleKey(title || (head && headingTitle(head))),ready:true,interactive:true} : null;
    }
    const embedded=/^(IFRAME|IMG|OBJECT|EMBED)$/.test(element.tagName);
    const marker=embedded ? element.getAttribute('src') || element.getAttribute('data') || '' : normalize(element.textContent);
    const ready=embedded ? !!marker && !/^about:blank(?:$|#)/iu.test(marker) &&
      (element.tagName!=='IMG' || element.complete && element.naturalWidth>0) : !!marker;
    const clockMarker=embedded ? marker : titleKey(title || (head && headingTitle(head)));
    return {element,marker,clockMarker,ready};
  }
  function collapsedFolders(document, visible) {
    // Verified in the public Angular template: the span only toggles isView;
    // clicking a folder's title can also change the current content. Use arrow.
    const sidebar = document.getElementById('tnContentList');
    if (!sidebar || !visible(sidebar)) return [];
    return [...sidebar.querySelectorAll('.__lesson-name > span.arrow,.__lesson-name-child > span.arrow')]
      .filter(e => visible(e) && !disabled(e) && e.querySelector('i.fa-chevron-down'))
      .map(control => ({control, title:normalize(control.parentElement.querySelector('a')?.textContent)}));
  }
  function blocker(document,title,visible) {
    if (!viewerMatches(document,title,visible)) return null;
    const container=document.getElementById('tnContentView');
    for(const banner of container.querySelectorAll('h4')) {
      if(!visible(banner) || banner.closest('#TNContentView'))continue;
      const message=normalize(banner.textContent);
      if(/^Nội dung sẽ bắt đầu vào\s*:/iu.test(message))return {kind:'date',message,titles:[]};
      if(/(?:cần|phải|yêu cầu|vui lòng|hãy).*hoàn thành|hoàn thành.*(?:trước|để)|nội dung.*tiên quyết/iu.test(message)) {
        // VNU's native relationRequired view is an h4 followed by
        // div > ul.no-padding > li. Read its labels, never application state.
        const titles=[...banner.parentElement.querySelectorAll('ul.no-padding > li')].filter(visible).map(titleText).filter(Boolean);
        return {kind:'prerequisite',message,titles};
      }
    }
    return null;
  }
  const availability=(document,title,visible)=>blocker(document,title,visible)?.message || null;
  function branchPosition(control,sidebar) {
    // Position identifies expansion bookkeeping only; it never chooses a
    // lesson. Starting above the heading ignores changing status icons.
    const position=[];
    for(let node=control.parentElement?.parentElement;node && node!==sidebar && node.parentElement;node=node.parentElement) {
      if(sidebar && !sidebar.contains(node))break;
      position.push([...node.parentElement.children].indexOf(node));
    }
    return position.reverse();
  }
  function menuSnapshot(document,visible) {
    const sidebar=document.getElementById('tnContentList');
    if(!sidebar || !visible(sidebar))return {available:false,items:[],folders:[]};
    const items=links(sidebar).map(a=>{
      const path=linkSections(a,sidebar).reverse(),head=a.closest('.__lesson-name,.__lesson-name-child');
      return {title:titleText(a),path,section:path.at(-1)||null,required:required(a) || !!head && required(head)};
    });
    const controls=[...sidebar.querySelectorAll('.__lesson-name > span.arrow,.__lesson-name-child > span.arrow,[aria-controls][aria-expanded]')]
      .filter(e=>visible(e) && normalize(e.getAttribute('aria-controls')).split(' ').every(id=>{
        const target=id && document.getElementById(id);return !target || sidebar.contains(target);
      }));
    const folders=controls.filter(e=>!controls.some(other=>other!==e && e.contains(other))).map(control=>{
        const native=control.matches('span.arrow'),head=native?control.parentElement:control.closest('.__lesson-name,.__lesson-name-child') || control;
        const label=head.querySelector('a') || (native?null:control),title=titleText(label);
        const path=[...linkSections(label || head,sidebar).reverse(),titleKey(title)];
        const wrapper=head.parentElement,controlled=normalize(control.getAttribute('aria-controls')).split(' ')
          .map(id=>id && document.getElementById(id)).filter(e=>e && sidebar.contains(e));
        const containers=native?[wrapper]:controlled;
        return {control,title,path,key:JSON.stringify([path,control.getAttribute('aria-controls') || '',branchPosition(control,sidebar)]),disabled:disabled(control),
          collapsed:control.getAttribute('aria-expanded')==='false' || !!control.querySelector('i.fa-chevron-down'),
          hasChildren:containers.some(container=>[...container.querySelectorAll('.__lesson-name,.__lesson-name-child')]
            .some(e=>e!==head && !head.contains(e) && !!titleText(e.querySelector('a'))))};
      });
    return {available:true,items,folders};
  }
  function scanMenu(document,visible,now,state) {
    const snapshot=menuSnapshot(document,visible);
    if(!snapshot.available) {
      if(!state.seen)return {...snapshot,kind:'ready',blocked:[],expanded:state.expanded||0};
      state.missingSince??=now;
      return {...snapshot,items:state.lastItems || [],kind:now-state.missingSince<8000?'waiting':'ready',
        blocked:[{title:'Menu nội dung',path:[],key:'missing-menu',reason:'Menu biến mất trong lúc đối chiếu; chưa kiểm tra hết các nhánh.'}],expanded:state.expanded||0};
    }
    state.seen=true;state.missingSince=null;state.lastItems=snapshot.items;
    state.attempts??=new Map();state.emptySince??=new Map();state.expanded??=0;
    const blocked=[];let loading=false;
    for(const folder of snapshot.folders) {
      if(folder.hasChildren)state.emptySince.delete(folder.key);
      const reason=folder.disabled ? 'Nhánh đang bị khóa; các mục phía trong chưa được xác minh.'
        : folder.collapsed && state.attempts.has(folder.key) && now-state.attempts.get(folder.key)>=8000
          ? 'Mũi tên chưa mở sau 8 giây; chưa kiểm tra được các mục phía trong.' : null;
      if(reason)blocked.push({...folder,control:undefined,reason});
      else if(!folder.collapsed && !folder.hasChildren) {
        if(!state.emptySince.has(folder.key))state.emptySince.set(folder.key,now);
        if(now-state.emptySince.get(folder.key)<8000)loading=true;
        else blocked.push({...folder,control:undefined,reason:'Nhánh đã mở nhưng chưa có mục con tải ra; chưa thể xác nhận đã kiểm tra hết.'});
      }
    }
    const candidates=snapshot.folders.filter(f=>f.collapsed && !f.disabled && !blocked.some(b=>b.key===f.key));
    const pending=candidates.find(f=>state.attempts.has(f.key));
    const next=candidates.find(f=>!state.attempts.has(f.key));
    if(next) {
      state.attempts.set(next.key,now);state.expanded++;state.stableAt=null;
      next.control.click();return {...snapshot,kind:'expanded',blocked,expanded:state.expanded};
    }
    if(pending || loading)return {...snapshot,kind:'waiting',blocked,expanded:state.expanded};
    const signature=JSON.stringify([snapshot.items,snapshot.folders.map(f=>[f.key,f.collapsed,f.disabled,f.hasChildren]),blocked.map(b=>b.key)]);
    if(signature!==state.signature){state.signature=signature;state.stableAt=now;}
    return {...snapshot,kind:now-state.stableAt>=1000?'ready':'waiting',blocked,expanded:state.expanded};
  }
  function unreportedMenuItems(snapshot,report) {
    const items=snapshot.items.filter(it=>it.required),rows=report.requiredItems,byTitle=new Map();
    items.forEach((item,i)=>{const key=titleKey(item.title);if(!byTitle.has(key))byTitle.set(key,[]);byTitle.get(key).push(i)});
    const owner=new Map(),assigned=new Map();
    // Audit coverage only, never a click rule. Reassign earlier broad matches
    // when a later row needs that leaf's specific section. An iterative search
    // handles overlapping ancestor labels without recursion or greedy guesses.
    rows.forEach((_,start)=>{
      const queue=[start],seenRows=new Set(queue),via=new Map();let free=null;
      for(let q=0;q<queue.length && free===null;q++) {
        const r=queue[q],row=rows[r];
        for(const i of byTitle.get(titleKey(row.title)) || []) {
          if(via.has(i) || row.section && !items[i].path.includes(titleKey(row.section)))continue;
          via.set(i,r);
          if(!owner.has(i)){free=i;break;}
          const next=owner.get(i);if(!seenRows.has(next)){seenRows.add(next);queue.push(next);}
        }
      }
      while(free!==null) {
        const r=via.get(free),previous=assigned.get(r);owner.set(free,r);assigned.set(r,free);free=previous??null;
      }
    });
    return items.filter((_,i)=>!owner.has(i));
  }
  const sectionNumber = value => titleKey(value).match(/^(?:bài\s+)?(\d+(?:\.\d+)*)(?=[\s.:)]|$)/u)?.[1];
  function openItem(document, title, visible, options = {}) {
    const matches = itemLinks(document, title, options);
    const shown = matches.filter(visible);
    if (shown.length > 1) return 'ambiguous';
    if (shown.length === 1) {
      if (disabled(shown[0])) return 'disabled';
      shown[0].click(); return 'clicked';
    }
    if (matches.length > 1) return 'ambiguous';
    // Expand only a control whose aria-controls explicitly names a containing
    // section. No guessed clicks on lesson headings or arbitrary parent nodes.
    const ancestors = new Set();
    for (let node = matches[0]?.parentElement; node; node = node.parentElement) if (node.id) ancestors.add(node.id);
    const expanders = [...document.querySelectorAll('[aria-controls][aria-expanded="false"]')]
      .filter(e => visible(e) && !disabled(e) &&
        normalize(e.getAttribute('aria-controls')).split(' ').some(id => ancestors.has(id)));
    const controls = expanders.filter(e => !expanders.some(other => other !== e && e.contains(other)));
    if (controls.length > 1) return 'ambiguous';
    let control = controls[0];
    if (!control) {
      const folders = collapsedFolders(document, visible);
      // When a hidden link is already mounted, open its own ancestor rather
      // than a folder elsewhere in the course.
      const containing=matches.length===1 ? folders.filter(f=>
        f.control.parentElement.parentElement.contains(matches[0]) &&
        !f.control.parentElement.contains(matches[0])) : [];
      const preferred = options.section ? folders.filter(f => titleKey(f.title) === titleKey(options.section)) : [];
      if (preferred.length > 1) return 'ambiguous';
      const number=sectionNumber(options.section);
      const parents=number ? folders.filter(f=>{
        const candidate=sectionNumber(f.title);
        return candidate && (candidate===number || number.startsWith(candidate+'.'));
      }).sort((a,b)=>sectionNumber(b.title).length-sectionNumber(a.title).length) : [];
      const numbered=parents.filter(f=>sectionNumber(f.title)===sectionNumber(parents[0]?.title));
      if (!containing.length && !preferred.length && numbered.length>1) return 'ambiguous';
      control = (containing[0] || preferred[0] || numbered[0] || folders[0])?.control;
    }
    if (control) {
      const label=control.parentElement.querySelector('a'),sidebar=document.getElementById('tnContentList');
      const path=JSON.stringify([...linkSections(label || control,sidebar).reverse(),titleKey(label),control.getAttribute('aria-controls') || '',branchPosition(control,sidebar)]);
      if (options.attempted?.has(control) || options.expandedPaths?.has(path)) return 'expanding';
      options.attempted?.add(control);options.expandedPaths?.add(path);control.click();return 'expanded';
    }
    return matches.length ? 'hidden' : 'missing';
  }
  function courseKey(pathname) {
    const match = pathname.match(/^\/learn\/lop-hoc\/chi-tiet\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})(?:\/|$)/iu);
    return match ? match[1].toLowerCase() : null;
  }
  return {normalize, key, titleText, titleKey, headingTitle, headingMatches, required, kind, number, progress, firstPending, tabs, tab, links, itemLinks, selected, viewerMatches, pageSnapshot, collapsedFolders, blocker, availability, menuSnapshot, scanMenu, unreportedMenuItems, openItem, courseKey};
})();
