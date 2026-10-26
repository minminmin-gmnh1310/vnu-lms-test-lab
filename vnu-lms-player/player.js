(() => {
  'use strict';
  if (document.getElementById('vnu-lecture-helper')) return;
  const host=document.createElement('div');host.id='vnu-lecture-helper';
  Object.assign(host.style,{position:'fixed',right:'16px',top:'90px',zIndex:'2147483647',maxWidth:'calc(100vw - 32px)'});
  const root=host.attachShadow({mode:'open'});
  // Create DOM nodes directly; compatible with sites enforcing Trusted Types.
  const style=document.createElement('style');
  style.textContent=`.box{box-sizing:border-box;width:365px;max-width:calc(100vw - 32px);max-height:calc(100vh - 110px);overflow:auto;padding:15px;background:#fff;color:#18202b;border:2px solid #dd5d98;border-radius:14px;box-shadow:0 5px 24px #0003;font:14px/1.5 Arial,sans-serif}h3{margin:0 0 8px;font-size:16px}p{margin:8px 0;white-space:pre-line;overflow-wrap:anywhere}button{padding:9px 12px;border:0;border-radius:8px;cursor:pointer;background:#b92e6b;color:#fff;margin-right:6px}button:disabled{opacity:.6;cursor:default}#stop{background:#465264}small{display:block;color:#555}.folded p,.folded small,.folded label,.folded .timing{display:none}.fold{float:right;padding:2px 6px;background:#465264}label{display:block;margin:8px 0;cursor:pointer}input{margin-right:6px}.timing{background:#f4f6f8;padding:10px;border-radius:9px;margin:8px 0}.timing dl{display:grid;grid-template-columns:1fr auto;gap:5px 10px;margin:8px 0}.timing dt{font-size:13px}.timing dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}.timing progress{width:100%;accent-color:#315c74}.timing small{font-size:12px}#lesson{font-size:13px;font-weight:600}#engine{font-size:12px;background:#edf3f7;padding:5px 8px;border-radius:6px}#status{font-size:13px}#estimated{color:#315c74}`;
  const box=document.createElement('section');box.className='box';
  style.textContent+=' .controls{display:flex;flex-wrap:wrap;gap:6px}.controls button{margin:0}#diagnose{background:#315c74}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;background:#f4f6f8;padding:10px;font:12px/1.5 monospace}.folded pre,.folded details{display:none}details{margin:8px 0;font-size:12px}summary{cursor:pointer;color:#8a2455}ul{padding-left:18px}li{margin:6px 0;overflow-wrap:anywhere}';
  style.textContent+=' .compact{padding:10px;font-size:12px}.compact h3{font-size:14px}.compact p{margin:5px 0}.compact #status{max-height:4.5em;overflow:auto}.compact .timing{padding:8px;margin:6px 0}.compact .timing dt,.compact .timing small{font-size:11px}.compact button{padding:7px 9px;font-size:12px}.controls{position:sticky;bottom:-15px;background:#fff;padding:5px 0;z-index:1}.compact .controls{bottom:-10px}#options summary{color:#315c74}';
  const heading=document.createElement('h3');heading.textContent='VNU · Nội dung bắt buộc 0.8.2';
  const fold=document.createElement('button');fold.className='fold';fold.textContent='−';fold.setAttribute('aria-label','Thu gọn bảng điều khiển');
  const status=document.createElement('p');status.id='status';status.setAttribute('role','status');
  const engine=document.createElement('p');engine.id='engine';
  const timing=document.createElement('div');timing.className='timing';
  const lesson=document.createElement('p');lesson.id='lesson';lesson.textContent='Chưa chọn nội dung';
  const metrics=document.createElement('dl'),values={};
  for(const [id,label] of [['required','Yêu cầu tối thiểu'],['recorded','LMS đã ghi nhận'],['remaining','Còn thiếu theo LMS'],['watched','Phát tại máy · phiên này'],['estimated','Còn lại ước tính']]){
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;if(id==='watched')dt.id='watch-label';dd.id=id;dd.textContent='--:--';values[id]=dd;metrics.append(dt,dd);
  }
  const bar=document.createElement('progress');bar.id='watch-progress';bar.max=1;bar.value=0;bar.setAttribute('aria-label','Ước tính thời gian tới ngưỡng tối thiểu');
  const position=document.createElement('small');position.id='position';
  const lmsState=document.createElement('small');lmsState.id='lms-state';
  const lmsRead=document.createElement('small');lmsRead.id='lms-read';
  const requiredSummary=document.createElement('small');requiredSummary.id='required-summary';
  const units=document.createElement('small');units.textContent='Thời gian hiển thị theo phút:giây.';
  timing.append(lesson,requiredSummary,metrics,bar,position,lmsState,lmsRead,units);
  const buttons=document.createElement('p');buttons.className='controls';
  const start=document.createElement('button');start.id='start';start.textContent='Bắt đầu';start.type='button';
  const stop=document.createElement('button');stop.id='stop';stop.textContent='Dừng';stop.type='button';
  const refresh=document.createElement('button');refresh.id='refresh';refresh.textContent='Đọc lại LMS';refresh.type='button';refresh.disabled=true;
  const diagnose=document.createElement('button');diagnose.id='diagnose';diagnose.textContent='Kiểm tra trang';diagnose.type='button';
  const report=document.createElement('pre');report.id='diagnostic';report.hidden=true;report.setAttribute('aria-label','Báo cáo kiểm tra trang');
  const preference=document.createElement('label');
  const auto=document.createElement('input');auto.id='auto-start';auto.type='checkbox';auto.checked=true;
  preference.append(auto,document.createTextNode('Tự chạy khi mở lớp'));
  const continuousLabel=document.createElement('label'),continuous=document.createElement('input');continuous.id='continuous';continuous.type='checkbox';continuous.checked=true;
  continuousLabel.append(continuous,document.createTextNode('Chạy liên tục, ghi lại mục chưa xong'));
  const muteLabel=document.createElement('label'),muteRecovery=document.createElement('input');muteRecovery.id='mute-recovery';muteRecovery.type='checkbox';muteRecovery.checked=true;
  muteLabel.append(muteRecovery,document.createTextNode('Thử tắt tiếng nếu bị chặn tự phát'));
  const visibilityLabel=document.createElement('label'),visibleMode=document.createElement('input');visibleMode.id='visible-mode';visibleMode.type='checkbox';visibleMode.checked=true;
  visibilityLabel.append(visibleMode,document.createTextNode('Chia màn hình: chạy khi tab LMS còn hiển thị'));
  const options=document.createElement('details'),optionsTitle=document.createElement('summary');options.id='options';options.open=true;optionsTitle.textContent='Tùy chọn chạy';
  const pending=document.createElement('details'),pendingSummary=document.createElement('summary'),pendingList=document.createElement('ul');
  pending.id='pending';pendingSummary.id='pending-summary';pendingList.id='pending-list';pending.append(pendingSummary,pendingList);pending.hidden=true;
  const holdForm=document.createElement('button');holdForm.id='hold-form';holdForm.type='button';holdForm.textContent='Giữ biểu mẫu để trả lời';holdForm.hidden=true;
  const hint=document.createElement('small');hint.textContent='Mục có ngưỡng phút được theo dõi và tự đọc lại LMS, kể cả khảo sát. Mục bị chặn được ghi vào Mục còn tồn; tiếp tục phần khác rồi thử lại một lượt. Chỉ LMS xác nhận hoàn thành. Khi điền biểu mẫu, bấm Giữ biểu mẫu; làm xong bấm Đọc lại LMS.';
  options.append(optionsTitle,preference,continuousLabel,muteLabel,visibilityLabel,hint);
  buttons.append(start,stop,refresh,diagnose,holdForm);heading.prepend(fold);box.append(heading,engine,status,timing,pending,options,buttons,report);root.append(style,box);
  document.documentElement.appendChild(host);
  const inCourse=()=>location.pathname.startsWith('/learn/');
  const courseKey=()=>VnuLms.courseKey(location.pathname);
  // Visibility and focus differ for side-by-side windows. This only changes
  // our playback gate; it never changes native visibility/focus or LMS state.
  const foreground=()=>document.visibilityState==='visible' && (visibleMode.checked || document.hasFocus());
  const viewport=()=>({width:Number.isFinite(window.innerWidth)&&window.innerWidth>0?window.innerWidth:1280,
    height:Number.isFinite(window.innerHeight)&&window.innerHeight>0?window.innerHeight:900});
  let compactLayout=null;
  const syncLayout=()=>{
    const {width,height}=viewport(),compact=width<=1100 || height<=650;
    if(compact===compactLayout)return;
    compactLayout=compact;box.classList.toggle('compact',compact);options.open=!compact;
    Object.assign(host.style,{right:compact?'8px':'16px',top:compact?'auto':'90px',bottom:compact?'8px':'auto',maxWidth:compact?'calc(100vw - 16px)':'calc(100vw - 32px)'});
    Object.assign(box.style,{width:compact?'280px':'365px',maxWidth:compact?'calc(100vw - 16px)':'calc(100vw - 32px)',maxHeight:compact?'calc(100vh - 16px)':'calc(100vh - 110px)'});
  };
  const ensureContentVisible=()=>{
    if(!foreground() || !compactLayout || queue?.editing || !queue?.target)return;
    const element=document.getElementById('TNContentView') || document.getElementById('tnContentView');
    if(!element || !visible(element) || typeof element.getBoundingClientRect!=='function' || typeof element.scrollIntoView!=='function')return;
    const bounds=element.getBoundingClientRect(),{width,height}=viewport();
    if(bounds.width>0 && bounds.height>0 && (bounds.bottom<=0 || bounds.top>=height || bounds.right<=0 || bounds.left>=width))
      element.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
  };
  const visible=e=>!!e.getClientRects().length && !['hidden','collapse'].includes(getComputedStyle(e).visibility) && getComputedStyle(e).display!=='none';
  const mediaSnapshot=(requireVisible=true)=>{
      const v=document.getElementById('TNContentView');
      if (!(v instanceof HTMLVideoElement) || !v.isConnected || (requireVisible && !visible(v))) return null;
      const declared=v.getAttribute('src') || v.querySelector('source[src]')?.getAttribute('src') || v.currentSrc || '';
      let source=declared;
      try {if (declared) source=new URL(declared,document.baseURI).href;} catch (_) {}
      return {video:v,source,
        canPlay:!v.currentSrc || !source || v.currentSrc===source,
        ready:v.readyState>=2 && !!v.currentSrc && (!source || v.currentSrc===source)};
    };
  const snapshot=()=>mediaSnapshot(true);
  const pageSnapshot=(title,interactive=false)=>{
    if(title && queue?.target?.titleDuplicate && !VnuLms.selected(document,title,visible,queue.target))return null;
    return VnuLms.pageSnapshot(document,title,visible,interactive);
  };
  const pauseCurrent=()=>{const item=mediaSnapshot(false);if(item && !item.video.paused)item.video.pause();};
  const nextButtons=()=>[...document.querySelectorAll('button')].filter(b=>
        b.textContent.replace(/\s+/g,' ').trim()==='Tiếp theo' && b.querySelector('i.fa-arrow-right') &&
        !b.disabled && b.getAttribute('aria-disabled')!=='true' && b.getClientRects().length &&
        getComputedStyle(b).visibility!=='hidden' && getComputedStyle(b).display!=='none');
  let queue=null,playbackMessage='',render=()=>{};
  const watch=new VnuWatchClock();
  const watchKey=titleKey=>courseKey()+'|'+titleKey;
  const show=(message,running)=>{status.textContent=message;start.disabled=running && queue?.phase!=='await-play';stop.disabled=!running;render();};
  const controller=new VnuPlayer({
    now:()=>performance.now(), inCourse, foreground, snapshot,
    get ended() {return queue?.running ? ()=>queue.videoEnded() : undefined;},
    next:()=>{
      const matches=nextButtons();
      if (!matches.length) return 'none';if (matches.length!==1) return 'ambiguous';
      matches[0].click();return 'clicked';
    },
    status:(message,running)=>{
      playbackMessage=message;
      if (!queue?.running || queue.phase==='playing') show(queue?.running ? queue.target.title+'\n'+message : message,running || !!queue?.running);
    }
  });
  const progress=()=>VnuLms.progress(document,visible);
  queue=new VnuCourseQueue({
    now:()=>performance.now(),courseKey,foreground,snapshot,progress,baseline:()=>mediaSnapshot(false),
    pageSnapshot,pageBaseline:()=>VnuLms.pageSnapshot(document,null,()=>true,queue?.target?.kind==='interactive'),
    progressTab:()=>VnuLms.tab(document,'Tiến trình học tập',visible,!['missing'].includes(progress().kind)),
    contentTab:()=>VnuLms.tab(document,'Nội dung',visible,VnuLms.links(document).some(visible) && progress().kind==='missing'),
    openItem:(title,options)=>VnuLms.openItem(document,title,visible,options),
    selected:(title,options)=>VnuLms.selected(document,title,visible,options),
    viewerMatches:title=>VnuLms.viewerMatches(document,title,visible),
    ensureVisible:ensureContentVisible,
    pauseCurrent,
    cancelPlayback:()=>controller.stop(),beginPlayback:()=>controller.start(),
    suspendPlayback:()=>controller.tick(),
    playbackRunning:()=>controller.running,playbackMessage:()=>playbackMessage,status:show,
    playbackAdvancing:()=>{const item=snapshot();return !!item && item.video.currentTime>controller.lastTime+0.05;},
    playbackBlocked:()=>controller.autoplayBlocked,
    continuous:()=>continuous.checked,muteRecovery:()=>muteRecovery.checked,
    watchedSeconds:key=>watch.record(watchKey(key)).seconds,
    unconfirmedSeconds:key=>watch.record(watchKey(key)).unconfirmed,
    started:()=>watch.reset(),reported:report=>{
      for(const row of report.items)watch.reported(watchKey(row.key),row.minutes);
    }
  });
  const observe=()=>{
    const item=snapshot(),key=queue.target?watchKey(queue.target.key):'manual|'+item?.source;
    if(queue.target && queue.target.kind!=='video'){
      watch.page(key,pageSnapshot(queue.target.title,queue.target.kind==='interactive'),performance.now(),
        foreground() && queue.running && ['viewing','manual'].includes(queue.phase));
      return;
    }
    const active=foreground() && (queue.running
      ? queue.phase==='playing' && controller.running && item?.source===queue.source &&
        (!queue.target.titleDuplicate || VnuLms.selected(document,queue.target.title,visible,queue.target))
      : controller.running);
    watch.sample(key,item,performance.now(),active);
  };
  const duration=(seconds,remaining=false)=>Number.isFinite(seconds)
    ? VnuPlayer.format(Math.max(0,remaining?Math.ceil(seconds):seconds)):'--:--';
  const phaseNames={idle:'Đã dừng',progress:'Đọc tiến trình',refresh:'Cập nhật LMS',content:'Mở Nội dung',open:'Mở danh sách bài','wait-video':'Tải đúng video','wait-content':'Tải đúng nội dung',playing:'Phát video',viewing:'Hiển thị nội dung bắt buộc',manual:'Chờ bạn thực hiện','await-play':'Chờ bạn bấm Play · video chưa chạy','retry-wait':'Chờ thử lại mục còn tồn'};
  let pendingSignature='';
  render=()=>{
    const now=performance.now(),item=snapshot();
    const target=queue.target,latest=target && queue.report?.items.find(v=>v.key===target.key);
    const row=latest || target,key=target?watchKey(target.key):'manual|'+item?.source;
    const record=watch.record(key),required=row?.requiredMinutes!=null?row.requiredMinutes*60:null;
    const recorded=row?.minutes!=null?row.minutes*60:null;
    const remaining=required!==null && recorded!==null?Math.max(0,required-recorded):null;
    const estimate=remaining!==null?Math.max(0,remaining-record.unconfirmed):null;
    lesson.textContent=target?.title || (item?'Video đang mở · chưa chọn theo tiến trình':'Chưa chọn nội dung');
    const mandatory=queue.report?.requiredItems;
    requiredSummary.textContent=mandatory?'Mục sao đỏ: '+mandatory.filter(v=>v.status==='complete').length+' / '+mandatory.length+' đã hoàn thành.':'Chưa đọc danh sách mục sao đỏ.';
    const waiting=[...queue.deferred.values()];pending.hidden=!waiting.length;
    pendingSummary.textContent='Mục còn tồn: '+waiting.length+' · chưa được LMS xác nhận';
    const signature=JSON.stringify(waiting.map(it=>[it.key,it.reason,it.failures,it.state]));
    if(signature!==pendingSignature) {
      pendingSignature=signature;pendingList.replaceChildren();
      for(const it of waiting){const li=document.createElement('li');li.textContent=it.title+(it.section?' ['+it.section+']':'')+' — '+it.reason+' '+(it.state==='retry-later'?'Sẽ thử lại sau.':it.state==='retrying'?'Đang thử lại.':'Cần xử lý trên LMS.');pendingList.append(li);}
    }
    if(waiting.length && !queue.running)pending.open=true;
    root.getElementById('watch-label').textContent=target && target.kind!=='video'?'Hiển thị tại máy · phiên này':'Phát tại máy · phiên này';
    values.required.textContent=duration(required);
    values.recorded.textContent=duration(recorded);
    values.remaining.textContent=duration(remaining,true);
    values.watched.textContent=duration(record.seconds);
    values.estimated.textContent=duration(estimate,true);
    bar.max=required>0?required:1;
    bar.value=required!==null && recorded!==null?Math.min(bar.max,recorded+record.unconfirmed):0;
    position.textContent=target && target.kind!=='video'
      ? 'Nội dung đang hiện đúng: '+(pageSnapshot(target.title,target.kind==='interactive')?.ready?'có':'chưa xác nhận')
      : item?'Vị trí video: '+duration(item.video.currentTime)+' / '+duration(item.video.duration):'Video chưa hiển thị.';
    if(item?.video.muted && target && queue.mutedKeys.has(target.key))position.textContent+=' Âm thanh tắt để xử lý chặn tự phát.';
    lmsState.textContent='Trạng thái từ LMS: '+(row?.statusText || 'chưa đọc được');
    if(queue.reportAt!==null){
      const age=Math.max(0,Math.floor((now-queue.reportAt)/1000));
      lmsRead.textContent='Số liệu LMS: đọc '+age+' giây trước. Đây là tuổi dữ liệu, không phải phút đã xem. Đọc lại LMS sẽ tạm dừng để lấy số mới.';
      const paused=target?.kind==='video' && item?.video.paused;
      if(queue.running && ['playing','viewing'].includes(queue.phase) && queue.nextCheckSeconds!==null)
        lmsRead.textContent+=paused?' Video đang tạm dừng; lịch đọc lại chờ Play.':' Tự đọc lại sau '+duration(queue.checkAfterGap && queue.nextCheckAt!==null?(queue.nextCheckAt-now)/1000:queue.nextCheckSeconds-record.seconds,true)+'.';
      if(queue.running && ['playing','viewing'].includes(queue.phase) && queue.checkAfterGap && !paused)
        lmsRead.textContent+=' Bộ đếm tại máy bị gián đoạn; lịch đọc lại LMS vẫn hoạt động.';
      if(queue.running && queue.phase==='manual')lmsRead.textContent+=' Đang chờ bạn thực hiện; làm xong bấm Đọc lại LMS.';
      lmsRead.textContent+=' Ước tính chưa được LMS xác nhận.';
      if(document.visibilityState==='visible' && visibleMode.checked && !document.hasFocus())lmsRead.textContent+=' Cửa sổ khác đang được chọn; cần kiểm tra phút LMS có tăng.';
      if(estimate===0 && row?.status!=='complete')lmsRead.textContent+=' Ước tính đủ phút; vẫn chờ trạng thái LMS.';
    }else lmsRead.textContent='Chưa đọc được phút LMS. --:-- nghĩa là chưa có dữ liệu.';
    const phase=queue.running?phaseNames[queue.phase]:controller.running?'Phát video':'Đã dừng';
    refresh.disabled=!queue.running || !['playing','await-play','viewing','manual'].includes(queue.phase);
    start.textContent=queue.running && queue.phase==='await-play'?'Phát video này':'Bắt đầu';
    start.disabled=(queue.running && queue.phase!=='await-play') || controller.running;
    stop.disabled=!queue.running && !controller.running;
    holdForm.hidden=!queue.running || target?.kind!=='interactive' || !['viewing','wait-content','manual'].includes(queue.phase);
    holdForm.disabled=queue.editing;holdForm.textContent=queue.editing?'Đang giữ biểu mẫu':'Giữ biểu mẫu để trả lời';
    const age=queue.running && !['playing','await-play','viewing','manual'].includes(queue.phase)?' · '+Math.max(0,Math.floor((now-queue.phaseAt)/1000))+' giây':'';
    const windowState=document.visibilityState!=='visible'?'Tab LMS bị ẩn · tạm dừng'
      :document.hasFocus()?'Tab LMS ở phía trước'
      :visibleMode.checked?'LMS còn hiển thị · cửa sổ khác đang được chọn':'Tab mất focus · tạm dừng';
    engine.textContent=windowState+'\nBước: '+phase+age;
  };
  let diagnosticRun=0;
  diagnose.addEventListener('click',()=>{
    const id=++diagnosticRun,item=snapshot();
    const lines=[
      'VNU Player 0.8.2 — kiểm tra trang',
      'Trang học: '+(inCourse()?'có':'không'),
      'Trang còn hiển thị: '+(document.visibilityState==='visible'?'có':'không'),
      'LMS có focus thật: '+(document.hasFocus()?'có':'không'),
      'Chế độ chia màn hình: '+(visibleMode.checked?'có':'không'),
      'Được tiếp tục theo chế độ: '+(foreground()?'có':'không'),
      'Khung cửa sổ: '+viewport().width+' × '+viewport().height+' px',
      'Bảng điều khiển gọn: '+(compactLayout?'có':'không'),
      'Video đúng ID: '+(mediaSnapshot(false)?'có':'không'),
      'Video đang hiển thị: '+(item?'có':'không'),
      'Nút Tiếp theo hợp lệ: '+nextButtons().length
    ];
    const table=progress();
    lines.push('Chế độ chọn bài: '+(queue.running?queue.phase:'đã dừng'),
      'Tab Tiến trình hợp lệ: '+VnuLms.tabs(document,'Tiến trình học tập',visible).length,
      'Tab Nội dung hợp lệ: '+VnuLms.tabs(document,'Nội dung',visible).length,
      'Bảng tiến trình đang hiện: '+table.kind,
      'Lần kiểm tra tiến trình: '+(queue.checkReason || 'khi mở lớp'),
      'Đang chờ thao tác Play: '+(queue.phase==='await-play'?'có':'không'),
      'Lỗi tự phát gần nhất: '+(controller.autoplayBlocked?'NotAllowedError':'không'),
      'Liên kết nội dung đang hiện: '+VnuLms.links(document).filter(visible).length,
      'Menu tnContentList: '+(document.getElementById('tnContentList')?'có':'không'),
      'Mục thu gọn nhận diện: '+VnuLms.collapsedFolders(document,visible).length,
      'Số mục đã bấm mở: '+(queue.expansions || 0));
    lines.push('Chạy liên tục: '+(queue.continuous?'có':'không'),'Mục còn tồn: '+queue.deferred.size,
      'Đang giữ biểu mẫu: '+(queue.editing?'có':'không'),'Lịch đọc dự phòng: '+(queue.checkAfterGap?'đang dùng':'chưa cần'));
    for(const it of queue.deferred.values())lines.push('Còn tồn: '+it.title+' | '+(it.section || 'mục gốc')+' | '+it.reason+' | lỗi '+it.failures+'/2 | '+it.state);
    const latestReport=table.kind==='ready'?table:queue.report;
    if(latestReport)lines.push('Báo cáo gần nhất: '+latestReport.items.length+' nội dung / '+latestReport.requiredItems.length+' mục sao đỏ',
      'Mục sao đỏ đã/chưa hoàn thành: '+latestReport.requiredItems.filter(v=>v.status==='complete').length+'/'+latestReport.requiredItems.filter(v=>v.status==='incomplete').length,
      'Hàng có tên trùng: '+latestReport.items.filter(v=>v.titleDuplicate).length,
      'Hàng trùng cả tên và mục chứa: '+latestReport.items.filter(v=>v.ambiguous).length);
    if(queue.target)lines.push('Bài đang chọn: '+queue.target.title,
      'Loại nội dung: '+queue.target.kind,
      'Dấu sao đỏ: '+(queue.target.required?'có':'không'),
      'Mục chứa bài: '+(queue.target.section || 'chưa đọc được'),
      'Tên bài có ở nhiều mục: '+(queue.target.titleDuplicate?'có; đối chiếu mục chứa':'không'),
      'Liên kết đúng mục đang hiện: '+VnuLms.itemLinks(document,queue.target.title,queue.target).filter(visible).length,
      'Phút LMS lúc chọn: '+(queue.target.minutes??'chưa đọc được'),
      'Ngưỡng tối thiểu: '+(queue.target.requiredMinutes??'chưa đọc được'),
      'Trạng thái LMS gần nhất: '+(queue.report?.items.find(v=>v.key===queue.target.key)?.statusText || 'chưa đọc được'),
      'Còn thiếu theo LMS: '+values.remaining.textContent,
      (queue.target.kind==='video'?'Phát':'Hiển thị')+' tại máy phiên này: '+values.watched.textContent,
      'Nội dung đang hiện đúng: '+(queue.target.kind==='video'?'xem trạng thái video':pageSnapshot(queue.target.title,queue.target.kind==='interactive')?.ready?'có':'chưa xác nhận'),
      'Còn lại ước tính: '+values.estimated.textContent,
      'Thông báo hiện tại: '+status.textContent);
    if (item) lines.push(
      'Nguồn đã tải đúng: '+(item.ready?'có':'chưa'),
      'readyState: '+item.video.readyState,
      'Lỗi media: '+(item.video.error?.code || 'không'),
      'Trạng thái video: '+(item.video.ended?'đã hết':item.video.paused?'tạm dừng':'đang phát'),
      'Đang đo vị trí video trong 2 giây…'
    );
    lines.push('Phút LMS: chưa xác minh bằng bộ đếm video; giá trị lấy từ Tiến trình học tập.');
    report.hidden=false;report.textContent=lines.join('\n');
    if (!item) return;
    const startTime=item.video.currentTime;
    setTimeout(()=>{
      if (id!==diagnosticRun) return;
      const current=snapshot();
      let result='Bài đang thay đổi; bấm Kiểm tra trang lại.';
      if (current && current.video===item.video && current.source===item.source) {
        const delta=current.video.currentTime-startTime;
        result='Video tiến thêm: '+(Number.isFinite(delta)?delta.toFixed(2):'?')+' giây trong khoảng 2 giây.';
        if (!foreground()) result+=' Tab đang bị ẩn hoặc đang chờ focus theo lựa chọn; kiểm tra lại khi tab hiển thị.';
      }
      report.textContent=lines.filter(x=>x!=='Đang đo vị trí video trong 2 giây…').concat(result).join('\n');
    },2000);
  });
  let prefsReady=false,lastCourse=null,pendingVisit=false,prefSerial=0,manualHold=false;
  const storage=typeof chrome!=='undefined'?chrome.storage?.local:null;
  start.addEventListener('click',()=>{
    manualHold=false;pendingVisit=false;watch.interrupt();
    if(queue.running && queue.phase==='await-play')queue.resumeWithGesture();
    else if(courseKey())queue.start();else controller.start();
    observe();render();
  });
  stop.addEventListener('click',()=>{observe();manualHold=true;pendingVisit=false;if(queue.running || courseKey())queue.stop();else controller.stop();watch.interrupt();render();});
  refresh.addEventListener('click',()=>{observe();watch.interrupt();queue.recheck();render();});
  holdForm.addEventListener('click',()=>{queue.protectForm();render();});
  // Autofocus is not evidence of editing. Hold on actual input/change or the
  // explicit Hold button; never inspect a cross-origin frame's answers.
  const protectNativeForm=event=>{
    if(!event.isTrusted || !queue.running || queue.target?.kind!=='interactive')return;
    const element=event.target;
    if(element?.matches?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]') &&
        document.getElementById('tnContentView')?.contains(element))queue.protectForm();
  };
  for(const name of ['input','change'])document.addEventListener(name,protectNativeForm,true);
  // The application's own autoplay can finish loading after Stop. Hold those
  // late starts until Start, a new course visit, or deliberate native interaction.
  document.addEventListener('play',event=>{
    if(manualHold && inCourse() && event.target instanceof HTMLVideoElement && event.target.id==='TNContentView')event.target.pause();
  },true);
  const nativeInteraction=event=>{
    if(!event.isTrusted)return;
    const target=event.target;
    const link=target?.closest?.('a[href]');
    if(target instanceof HTMLVideoElement && target.id==='TNContentView')manualHold=false;
    else if(link && VnuLms.links(document).includes(link)){
      manualHold=false;pendingVisit=false;
      if(queue.running)queue.stop('Bạn đã chọn bài thủ công. Bấm Bắt đầu nếu muốn chọn lại theo tiến trình.');
    }
  };
  document.addEventListener('pointerdown',nativeInteraction,true);
  document.addEventListener('keydown',nativeInteraction,true);
  let lastMediaUpdate=-Infinity;
  for(const name of ['timeupdate','playing','pause','ended','waiting','loadedmetadata','seeked'])document.addEventListener(name,event=>{
    if(event.target instanceof HTMLVideoElement && event.target.id==='TNContentView'){
      const now=performance.now();
      if(name==='timeupdate' && now-lastMediaUpdate<400)return;
      lastMediaUpdate=now;observe();render();
    }
  },true);
  document.addEventListener('seeking',event=>{
    if(event.target instanceof HTMLVideoElement && event.target.id==='TNContentView')watch.interrupt();
  },true);
  auto.addEventListener('change',()=>{
    const serial=++prefSerial;pendingVisit=false;
    if(storage) {
      try {storage.set({vnuLmsAutoStart:auto.checked},()=>{
        if(chrome.runtime?.lastError && serial===prefSerial)hint.textContent='Chưa lưu được lựa chọn tự chạy. Kiểm tra/tải lại tiện ích trong edge://extensions.';
      });} catch (_) {hint.textContent='Chưa lưu được lựa chọn tự chạy. Tải lại tiện ích trong edge://extensions.';}
    }
    if(auto.checked && courseKey()){manualHold=false;queue.start();}
    else if(!auto.checked && queue.running){manualHold=true;queue.stop('Đã tắt tự chạy. Bấm Bắt đầu nếu muốn chạy lớp này.');}
  });
  continuous.addEventListener('change',()=>{
    queue.setContinuous(continuous.checked);render();
    try{storage?.set({vnuLmsContinuous:continuous.checked},()=>{});}catch(_){}
  });
  muteRecovery.addEventListener('change',()=>{try{storage?.set({vnuLmsMuteRecovery:muteRecovery.checked},()=>{});}catch(_){}});
  visibleMode.addEventListener('change',()=>{
    // Do not count a gap retroactively when the eligibility setting changes.
    watch.interrupt();
    try{storage?.set({vnuLmsVisibleMode:visibleMode.checked},()=>{});}catch(_){}
    tick();
  });
  fold.addEventListener('click',()=>{const folded=box.classList.toggle('folded');fold.textContent=folded?'+':'−';fold.setAttribute('aria-label',folded?'Mở bảng điều khiển':'Thu gọn bảng điều khiển');});
  const tick=()=>{
    syncLayout();
    observe();
    host.style.display=inCourse()?'block':'none';
    const course=courseKey();
    if(course!==lastCourse) {
      if(queue.running)queue.stop('Đã chuyển lớp học.');
      if(controller.running)controller.stop('Đã chuyển lớp học.');
      queue.target=null;queue.report=null;queue.reportAt=null;watch.reset();
      queue.deferred=new Map();queue.thresholdChecks=new Map();queue.mutedKeys=new Set();queue.editing=false;
      lastCourse=course;pendingVisit=!!course;manualHold=false;
    }
    if(prefsReady && pendingVisit) {pendingVisit=false;if(auto.checked)queue.start();}
    if(manualHold && inCourse())pauseCurrent();
    queue.tick();controller.tick();observe();render();
  };
  document.addEventListener('visibilitychange',tick);window.addEventListener('focus',tick);window.addEventListener('blur',tick);
  window.addEventListener('resize',()=>{
    watch.interrupt();syncLayout();
    if(queue.running && ['playing','await-play','viewing','manual'].includes(queue.phase))ensureContentVisible();
    tick();
  });
  window.addEventListener('pagehide',()=>{manualHold=true;pendingVisit=false;queue.stop();controller.stop();});
  window.addEventListener('pageshow',event=>{
    if(event.persisted){lastCourse=null;pendingVisit=!!courseKey();tick();}
  });
  if(storage) {
    auto.disabled=true;
    try {storage.get({vnuLmsAutoStart:true,vnuLmsContinuous:true,vnuLmsMuteRecovery:true,vnuLmsVisibleMode:true},value=>{
      const error=chrome.runtime?.lastError;
      auto.checked=!error && value?.vnuLmsAutoStart!==false;
      continuous.checked=value?.vnuLmsContinuous!==false;muteRecovery.checked=value?.vnuLmsMuteRecovery!==false;
      visibleMode.checked=value?.vnuLmsVisibleMode!==false;
      prefsReady=true;auto.disabled=false;tick();
      if(error)hint.textContent='Chưa đọc được lựa chọn tự chạy. Bấm Bắt đầu để chạy thủ công.';
    });} catch (_) {auto.checked=false;prefsReady=true;auto.disabled=false;}
  } else prefsReady=true;
  setInterval(tick,500);tick();
})();
