/* Required LMS items in table order; native playback and visible reading. */
const VnuCourseQueue = (() => {
  'use strict';
  const PAGE_WAIT = 60000, DISCOVERY_WAIT = 600000;
  const STABLE_WAIT = 1000, REVIEW_WAIT = 60000, RETRY_WAIT = 15000;
  return class VnuCourseQueue {
    constructor(adapter) {
      this.a = adapter; this.running = false; this.phase = 'idle';
      this.target = null; this.review = null; this.confirmed = 0; this.awayAt = null;
      this.knownSources = new Map(); this.knownPages = new Map(); this.knownKinds = new Map(); this.sourceCourse = null;
      this.report = null; this.reportAt = null;
      this.awaitUser = false; this.nextCheckSeconds = null; this.nextCheckAt = null; this.checkReason = null;
      this.pageChecks = new Map(); this.checkpoint = null; this.needsReview = false;
      this.deferred=new Map();this.thresholdChecks=new Map();this.continuous=false;
      this.editing=false;this.muteTried=false;this.mutedKeys=new Set();this.globalRetries=0;
      this.checkAfterGap=false;this.lastEligibleAt=null;this.pollPausedAt=null;
      this.attempts=new Map();this.playMissingAt=null;
      this.observedRequired=new Map();this.completionSignature=null;this.auditSignature=null;this.menuAudit=null;this.menuScanState=null;
    }
    say(message) {this.a.status(message, this.running);}
    stop(message = 'Đã dừng. Bấm Bắt đầu để chọn mục bắt buộc chưa hoàn thành.') {
      this.running = false; this.phase = 'idle'; this.awayAt = null;
      this.awaitUser = false; this.clearCheck();
      this.a.cancelPlayback(); this.a.pauseCurrent(); this.say(message);
    }
    start() {
      if (this.running) return;
      const course = this.a.courseKey();
      if (!course) {this.say('Mở trang chi tiết một lớp học để chọn mục bắt buộc chưa hoàn thành.'); return;}
      this.course = course; this.running = true; this.target = this.review = null;
      this.awaitUser = false; this.clearCheck(); this.checkReason = null;
      this.pageChecks = new Map(); this.checkpoint = null; this.needsReview = false;
      this.deferred=new Map();this.thresholdChecks=new Map();this.globalRetries=0;
      this.continuous=this.a.continuous?.()===true;this.editing=false;
      this.muteTried=false;this.mutedKeys=new Set();
      this.attempts=new Map();this.playMissingAt=null;
      this.observedRequired=new Map();this.completionSignature=null;this.auditSignature=null;this.menuAudit=null;this.menuScanState=null;
      this.report = null; this.reportAt = null; this.a.started?.();
      this.baseline = null; this.captureBaseline();
      if (this.sourceCourse !== course) {this.knownSources = new Map(); this.knownPages = new Map(); this.knownKinds = new Map(); this.sourceCourse = course;}
      this.confirmed = 0; this.awayAt = null; this.a.cancelPlayback(); this.a.pauseCurrent();
      this.readProgress(); this.tick();
    }
    enter(phase) {
      this.phase = phase; this.phaseAt = this.a.now(); this.requested = false;
      this.signature = null; this.stableAt = null; this.lastEligibleAt=null;
    }
    captureBaseline() {
      const item = this.a.baseline?.() || this.a.snapshot();
      if (item?.source) this.baseline = {video:item.video,source:item.source};
      this.pageBaseline = this.a.pageBaseline?.() || null;
    }
    readProgress(keepAudit=false) {
      if(!keepAudit)this.auditSignature=null;
      this.captureBaseline();this.enter('progress');this.say('Đang đọc Tiến trình học tập để chọn mục sao đỏ chưa hoàn thành…');
    }
    remember(item,reason,retryable=true,detail={}) {
      const previous=this.deferred.get(item.key);
      const failures=(previous?.failures || 0)+1;
      this.deferred.set(item.key,{key:item.key,title:item.title,section:item.section,reason,failures,status:item.status,ambiguous:item.ambiguous,
        state:retryable && failures<2?'retry-later':'needs-action',...detail});
    }
    defer(reason,retryable=true,detail={}) {
      if(!this.running || !this.target){this.stop(reason);return;}
      this.remember(this.target,reason,retryable,detail);
      this.review=null;this.checkpoint=null;this.needsReview=false;this.editing=false;
      this.awaitUser=false;this.clearCheck();this.a.cancelPlayback();this.a.pauseCurrent();
      this.readProgress();this.say('Đã ghi vào mục còn tồn: '+this.target.title+'. '+reason+' Đang tiếp tục nội dung khác…');
    }
    fail(reason,retryable=true,detail={}) {
      if(this.continuous && this.target)this.defer(reason,retryable,detail);else this.stop(reason);
    }
    waitForPrerequisites(blocked) {
      const titles=blocked.titles || [];
      const ready=titles.length && titles.every(title=>{
        const matches=this.report.items.filter(row=>VnuLms.titleKey(row.title)===VnuLms.titleKey(title));
        return matches.length===1 && matches[0].status==='complete';
      });
      const retry=ready && !(this.deferred.get(this.target.key)?.failures);
      this.fail('LMS yêu cầu hoàn thành bài trước. '+blocked.message+(titles.length?' Cần: '+titles.join('; '):''),retry,
        {waitFor:titles.length?'prerequisite':'unlock',prerequisiteTitles:titles,completionSignature:this.completionSignature,
          state:retry?'retry-later':'waiting-prerequisite'});
    }
    ensureMenuAudit() {
      if(!this.a.scanMenu || this.auditSignature===this.completionSignature)return false;
      this.menuScanState={};this.enter('audit-content');
      this.say('Đang kiểm tra các nhánh menu còn lại trước khi kết luận đã chạy hết…');return true;
    }
    reconcileMenu(report) {
      if(!this.menuAudit || this.auditSignature!==this.completionSignature)return;
      for(const [key,record] of this.deferred)if(record.fromMenu)this.deferred.delete(key);
      const missing=new Set([...this.deferred.values()].filter(record=>record.waitFor==='report' && !record.fromMenu));
      const extras=VnuLms.unreportedMenuItems(this.menuAudit,report).filter(item=>{
        const prior=[...missing].find(record=>VnuLms.titleKey(record.title)===VnuLms.titleKey(item.title) &&
          (!record.section || item.path.includes(VnuLms.titleKey(record.section))));
        if(prior){missing.delete(prior);return false;}return true;
      });
      const records=[...extras.map((item,index)=>({...item,key:'menu:item:'+JSON.stringify([item.path,VnuLms.titleKey(item.title),index]),
        reason:'Có sao đỏ trong menu nhưng chưa đối chiếu được với hàng tiến trình. Chưa thể xác nhận hoàn thành.',state:'needs-action'})),
        ...this.menuAudit.blocked.map(item=>({...item,key:'menu:branch:'+item.key,reason:item.reason,state:'waiting-prerequisite'}))];
      for(const record of records)this.deferred.set(record.key,{...record,section:record.path.join(' » '),failures:0,status:'unknown',fromMenu:true});
    }
    protectForm() {
      if(!this.running || this.target?.kind!=='interactive' || !['wait-content','viewing','manual'].includes(this.phase))return;
      this.editing=true;this.clearCheck();
      if(this.phase==='viewing')this.enter('manual');
      if(this.phase==='manual')this.phaseMessage();
    }
    setContinuous(value) {
      this.continuous=value;
      if(!this.running || !this.target || this.editing)return;
      if(value && this.phase==='manual') {
        if(Number.isFinite(this.target.requiredMinutes)){this.needsReview=false;this.enter('viewing');this.scheduleCheck();}
        else this.defer('Chưa đọc được điều kiện thời gian; cần kiểm tra hoặc thực hiện trên LMS.',false);
      }else if(!value && this.target.kind==='interactive' && this.phase==='viewing') {
        this.enter('manual');this.clearCheck();
      }
    }
    videoEnded() {
      if (!this.running || this.phase !== 'playing') return;
      this.checkReason = 'ended'; this.clearCheck();
      this.review = {...this.target}; this.reviewAt = this.a.now(); this.refreshes = 0;
      this.a.cancelPlayback(); this.readProgress();
    }
    recheck(reason = 'manual') {
      if (!this.running || !['playing','await-play','viewing','manual'].includes(this.phase)) return;
      this.checkpoint=reason==='timer' && (this.continuous || this.target.kind==='page') ? {key:this.target.key,minutes:this.target.minutes} : null;
      this.editing=false;
      this.checkReason = reason; this.clearCheck();
      this.review = null; this.a.cancelPlayback(); this.a.pauseCurrent(); this.readProgress();
    }
    waitForPlay() {
      this.awaitUser = true; this.playMissingAt=null; this.enter('await-play');
      this.say('Edge chặn tự phát. Video chưa chạy. Bấm Phát video này hoặc Play trên video; tool sẽ tiếp tục ngay bài đã chọn.');
    }
    resumeWithGesture() {
      if (!this.running || this.phase !== 'await-play' || !this.a.foreground()) return;
      const item = this.a.snapshot();
      if (!item || item.source !== this.source) {this.fail('Video đã thay đổi trong lúc chờ Play. Bấm Bắt đầu để chọn lại.');return;}
      if (this.target.titleDuplicate && !this.a.selected(this.target.title,this.target)) {
        this.fail('Chưa xác nhận được đúng mục chứa video trùng tên. Bấm Bắt đầu để chọn lại.');return;
      }
      this.awaitUser = false; this.enter('playing'); this.beginAttempt(); this.scheduleCheck();
      // Called directly by the panel's click handler, without scanning tabs,
      // promises or a timeout before invoking the native play() method.
      this.a.beginPlayback(); this.handlePlaybackStopped();
    }
    scheduleCheck() {
      const watched = this.a.watchedSeconds?.(this.target.key);
      if (!Number.isFinite(watched)) {this.clearCheck();return;}
      const additional = this.a.unconfirmedSeconds?.(this.target.key) || 0;
      const remaining = Number.isFinite(this.target.requiredMinutes) && Number.isFinite(this.target.minutes)
        ? (this.target.requiredMinutes - this.target.minutes) * 60 - additional : null;
      // Check once per minute of observed playback, earlier near the threshold.
      // Once local time is sufficient, allow 30s more before rereading so an
      // unchanged LMS report cannot create an endless rapid tab-switch loop.
      const interval = remaining !== null && remaining <= 0 ? 30
        : remaining !== null ? Math.min(60, Math.max(1, remaining)) : 60;
      this.nextCheckSeconds = watched + interval;
      this.nextCheckAt=this.a.now()+interval*1000;this.checkAfterGap=false;this.pollPausedAt=null;
    }
    clearCheck() {
      this.nextCheckSeconds=null;this.nextCheckAt=null;this.checkAfterGap=false;
      this.lastEligibleAt=null;this.pollPausedAt=null;
    }
    beginAttempt() {
      if(!this.attempts.has(this.target.key))this.attempts.set(this.target.key,{waited:0});
      this.lastEligibleAt=this.a.now();
    }
    noteEligible() {
      const now=this.a.now();
      if(this.lastEligibleAt!==null && now>this.lastEligibleAt) {
        const elapsed=now-this.lastEligibleAt;
        if(elapsed>5000)this.checkAfterGap=true;
        const attempt=this.attempts.get(this.target.key);
        // A watchdog budget, not watched time. It can only cause a real LMS
        // reread or an honest pending result; never credit or completion.
        if(attempt)attempt.waited+=elapsed/1000;
      }
      this.lastEligibleAt=now;
    }
    checkDue(advancing=true) {
      return this.nextCheckSeconds!==null &&
        (this.a.watchedSeconds(this.target.key)>=this.nextCheckSeconds ||
          advancing && this.checkAfterGap && this.nextCheckAt!==null && this.a.now()>=this.nextCheckAt);
    }
    samePage(item,known) {
      return !!item && !!known && item.element===known.element &&
        (item.marker===known.marker || item.clockMarker!==undefined && item.clockMarker===known.clockMarker);
    }
    rememberPage(item) {
      this.knownPages.set(this.target.key,{element:item.element,marker:item.marker,clockMarker:item.clockMarker});
    }
    recognizeVideo() {
      const item=this.a.snapshot();
      if(!item?.source || !this.a.viewerMatches?.(this.target.title) || !this.a.selected(this.target.title,this.target))return false;
      const identified=!this.before || item.source!==this.before.source || this.selectedBefore ||
        this.knownSources.get(this.target.key)===item.source;
      if(!identified)return false;
      // The progress title is a hint, not the content type. A verified native
      // player can promote a generically named item without changing LMS data.
      this.target.kind='video';this.knownKinds.set(this.target.key,'video');
      this.enter('wait-video');this.phaseMessage();return true;
    }
    handlePlaybackStopped() {
      if (this.a.playbackRunning()) return;
      if (this.a.playbackBlocked?.()) {
        if(this.continuous && this.a.muteRecovery?.()===true) {
          const item=this.a.snapshot();
          if(!this.muteTried && item?.source===this.source &&
              (!this.target.titleDuplicate || this.a.selected(this.target.title,this.target))) {
            this.muteTried=true;
            try{item.video.muted=true;}catch(_){this.fail('Không bật được phát tắt tiếng để xử lý chặn tự phát.',false);return;}
            this.mutedKeys.add(this.target.key);this.a.beginPlayback();
            this.say('Edge chặn âm thanh tự phát; đang thử phát video này ở 1× với âm thanh tắt.');return;
          }
          this.fail('Edge vẫn chặn tự phát sau lần thử tắt tiếng. Video chưa được xác nhận đã xem.',false);return;
        }
        this.waitForPlay();
      }else this.fail(this.a.playbackMessage());
    }
    choose(report) {
      this.globalRetries=0;
      const completed=JSON.stringify(report.items.filter(row=>row.status==='complete').map(row=>row.key).sort());
      const changed=this.completionSignature!==null && completed!==this.completionSignature;
      this.completionSignature=completed;
      if(changed)this.auditSignature=null;
      const requested=new Set([...this.deferred.values()].flatMap(record=>record.prerequisiteTitles || []).map(VnuLms.titleKey));
      for(const [key,record] of this.deferred) {
        const row=report.items.find(it=>it.key===key);
        if(row && (row.status==='complete' || !row.required && !requested.has(VnuLms.titleKey(row.title))))this.deferred.delete(key);
        else if(row && record.waitFor==='report')this.deferred.delete(key);
        else if(record.waitFor==='unlock' && record.completionSignature!==completed)this.deferred.delete(key);
        else if(record.waitFor==='prerequisite' && record.completionSignature!==completed && record.prerequisiteTitles?.length &&
          record.prerequisiteTitles.every(title=>{
            const matches=report.items.filter(it=>VnuLms.titleKey(it.title)===VnuLms.titleKey(title));
            return matches.length===1 && matches[0].status==='complete';
          }))this.deferred.delete(key);
        else if(row && record.status==='unknown' && row.status==='incomplete' && !row.ambiguous)this.deferred.delete(key);
        else if(!row && record.ambiguous) {
          const matches=report.items.filter(it=>VnuLms.titleKey(it.title)===VnuLms.titleKey(record.title) &&
            VnuLms.titleKey(it.section)===VnuLms.titleKey(record.section));
          if(matches.length===1 && !matches[0].ambiguous)this.deferred.delete(key);
        }
      }
      for(const [key,old] of this.observedRequired)if(old.status!=='complete' && !report.items.some(row=>row.key===key) && !this.deferred.has(key))
        this.remember(old,'Mục bắt buộc từng chưa hoàn thành hiện không có trong báo cáo; chưa thể xác nhận đã xong.',false,{waitFor:'report'});
      for(const row of report.items)if(row.required)this.observedRequired.set(row.key,{...row});else this.observedRequired.delete(row.key);
      this.reconcileMenu(report);
      if (this.review) {
        const previous = report.items.find(v => v.key === this.review.key);
        if (!previous || previous.status === 'unknown') {
          this.fail('Không xác định được trạng thái video vừa phát. Kiểm tra Tiến trình học tập.'); return;
        }
        if (previous.status === 'complete') {
          this.confirmed++; this.review = null;
        } else {
          const elapsed = this.a.now() - this.reviewAt;
          if (elapsed < REVIEW_WAIT) {
            this.say('Đã phát hết video; đang chờ LMS cập nhật thời gian và trạng thái…');
            if (elapsed >= 5000 && this.refreshes === 0) {
              this.refreshes++; this.enter('refresh');
            }
            return;
          }
          // A final real tab refresh allows delayed server updates to appear.
          if (this.refreshes < 2) {
            this.refreshes++; this.enter('refresh');
            this.say('Đang đọc lại tiến trình lần cuối trước khi quyết định phát tiếp…'); return;
          }
          if (previous.minutes === null || this.review.minutes === null) {
            this.fail('Không đủ dữ liệu phút học để xác minh LMS đã ghi tăng. Kiểm tra Tiến trình học tập rồi Bắt đầu.'); return;
          }
          if (previous.minutes <= this.review.minutes + 0.001) {
            this.fail('LMS chưa ghi nhận thêm phút học cho video vừa phát. Kiểm tra tiến trình rồi Bắt đầu lại.'); return;
          }
          if (previous.requiredMinutes === null) {
            this.fail('Chưa đọc được ngưỡng thời gian tối thiểu; LMS vẫn ghi Chưa hoàn thành. Kiểm tra điều kiện trên LMS.',false); return;
          }
          if (previous.minutes >= previous.requiredMinutes) {
            this.fail('LMS vẫn ghi Chưa hoàn thành dù đủ ngưỡng phút. Kiểm tra các điều kiện của bài trên LMS.',false); return;
          }
          // A short lecture can require another real playback. Never manufacture
          // elapsed time, mark completion locally, or seek forward to finish it.
          this.review = null;
        }
      }
      if (!report.requiredItems.length) {
        this.stop('Chưa nhận diện được mục sao đỏ trong bảng. Bấm Kiểm tra trang và gửi một hàng bắt buộc để điều chỉnh.');return;
      }
      const priority=[];
      for(const record of this.deferred.values())for(const title of record.prerequisiteTitles || []) {
        const matches=report.items.filter(it=>VnuLms.titleKey(it.title)===VnuLms.titleKey(title));
        if(matches.length===1 && !priority.some(it=>it.key===matches[0].key))priority.push(matches[0]);
      }
      const ordered=[...priority,...report.requiredItems.filter(it=>!priority.some(p=>p.key===it.key))];
      let choice = VnuLms.firstPending(ordered);
      if(this.continuous) {
        // A deferred row remains incomplete. Exclusion only chooses another
        // usable item; neither the report nor the server status is rewritten.
        for(;;) {
          const candidates=ordered.filter(it=>!this.deferred.has(it.key) || this.deferred.get(it.key).state==='retrying');
          choice=VnuLms.firstPending(candidates);
          if(choice.kind!=='unknown' && choice.kind!=='ambiguous')break;
          this.remember(choice.item,choice.kind==='unknown'
            ? 'Trạng thái LMS chưa xác định: '+choice.item.statusText
            : 'Trùng cả tên lẫn mục chứa; chưa thể chọn liên kết an toàn.',false);
        }
        if(choice.kind==='done' && this.ensureMenuAudit())return;
        if(choice.kind==='done' && this.deferred.size) {
          const retry=[...this.deferred.values()].some(record=>record.state==='retry-later');
          if(retry){this.enter('retry-wait');this.retryAt=this.a.now()+RETRY_WAIT;this.a.cancelPlayback();this.a.pauseCurrent();this.phaseMessage();}
          else this.stop('Chưa hoàn thành. Còn '+this.deferred.size+' mục chưa được LMS xác nhận; xem danh sách Mục còn tồn.');
          return;
        }
      }
      if (choice.kind === 'done') {
        if(this.ensureMenuAudit())return;
        if(this.deferred.size){this.stop('Còn '+this.deferred.size+' mục hoặc nhánh chưa được xác minh; xem Mục còn tồn.');return;}
        if(this.menuAudit && !this.menuAudit.available){
          this.stop('LMS ghi Đã hoàn thành cho tất cả mục có sao đỏ trong bảng, nhưng chưa nhận diện hoặc chưa thấy menu để kiểm tra hết mục con. Chưa xác nhận toàn bộ môn; kiểm tra menu và bài kiểm tra trên LMS.');return;
        }
        this.stop('LMS ghi Đã hoàn thành cho tất cả mục có sao đỏ trong bảng. Kiểm tra điểm, bài kiểm tra và các điều kiện của môn trên LMS.'); return;
      }
      if (choice.kind === 'unknown') {
        this.stop('Chưa xác định được trạng thái: ' + choice.item.title + '. Kiểm tra bài bị khóa hoặc điều kiện trên LMS.'); return;
      }
      if (choice.kind === 'ambiguous') {
        this.stop('Mục bắt buộc trùng tên trong cùng mục chứa bài: '+choice.item.title+'. Chọn bài trên LMS và bấm Kiểm tra trang để xác định thêm.');return;
      }
      const resolvedKind=this.knownKinds.get(choice.item.key) || choice.item.kind;
      if (choice.item.key!==this.target?.key || resolvedKind!=='video') this.awaitUser=false;
      const priorTarget=this.target;
      this.target = {...choice.item,kind:resolvedKind}; this.expansions = 0; this.rewound = false;
      if(priorTarget?.key!==this.target.key){this.editing=false;this.muteTried=false;}
      if(priorTarget?.key===this.target.key && Number.isFinite(priorTarget.minutes) &&
          Number.isFinite(this.target.minutes) && this.target.minutes>priorTarget.minutes+0.001){
        this.pageChecks.set(this.target.key,0);this.attempts.delete(this.target.key);
      }
      if(this.checkpoint?.key===this.target.key){
        const previous=this.checkpoint.minutes;
        const count=Number.isFinite(previous) && Number.isFinite(this.target.minutes) && this.target.minutes>previous+0.001
          ? 0 : (this.pageChecks.get(this.target.key) || 0)+1;
        this.pageChecks.set(this.target.key,count);
        if(this.continuous) {
          const enough=Number.isFinite(this.target.requiredMinutes) && Number.isFinite(this.target.minutes) &&
            this.target.minutes>=this.target.requiredMinutes;
          const checks=enough?(this.thresholdChecks.get(this.target.key) || 0)+1:0;
          this.thresholdChecks.set(this.target.key,checks);
          if(checks>=3){this.checkpoint=null;this.defer('LMS đã ghi đủ phút nhưng vẫn Chưa hoàn thành sau 3 lần kiểm tra; có thể còn điều kiện khác.',false);return;}
          if(count>=3 && this.target.minutes===null){this.checkpoint=null;this.defer('Không đọc được số phút do LMS ghi nhận sau 3 lần kiểm tra.');return;}
        }
      }
      this.checkpoint=null;
      this.needsReview=(this.continuous || this.target.kind==='page') && (this.pageChecks.get(this.target.key) || 0)>=3 &&
        Number.isFinite(this.target.requiredMinutes) && Number.isFinite(this.target.minutes) &&
        ((this.a.unconfirmedSeconds?.(this.target.key) || 0)>=(this.target.requiredMinutes-this.target.minutes)*60 ||
          (this.attempts.get(this.target.key)?.waited || 0)>=(this.target.requiredMinutes-this.target.minutes)*60);
      if(this.continuous && this.needsReview) {
        this.defer('LMS chưa ghi tăng phút sau 3 lần kiểm tra và đã hết khoảng chờ theo ngưỡng của mục này.');return;
      }
      this.scheduleCheck();
      this.attemptedFolders = new WeakSet();this.expandedPaths=new Set();this.lastExpansionAt = null;
      this.enter('content'); this.say('Đang mở mục sao đỏ chưa hoàn thành đầu tiên: ' + this.target.title);
    }
    handleView(outcome, name) {
      if (outcome === 'active' || outcome === 'clicked') {this.requested = true; this.requestAt = this.a.now(); return true;}
      if (outcome === 'ambiguous' || outcome === 'disabled') {
        this.stop(outcome === 'ambiguous' ? 'Có nhiều nút ' + name + '; chưa xác định được nút đúng.' : 'Mục ' + name + ' đang bị khóa.');
      }
      return false;
    }
    phaseMessage() {
      const seconds = Math.max(0, Math.floor((this.a.now() - this.phaseAt) / 1000));
      const messages = {
        progress:'Đang đọc Tiến trình học tập để chọn mục sao đỏ chưa hoàn thành…',
        refresh:'Đang mở lại tiến trình để đọc phút do LMS ghi nhận…',
        content:'Đang mở tab Nội dung…',
        'audit-content':'Đang mở Nội dung để kiểm tra mọi nhánh menu còn lại…',
        audit:'Đang đối chiếu cây menu; đã mở '+(this.menuScanState?.expanded || 0)+' nhánh trong lượt kiểm tra này…',
        open:'Đang tìm liên kết nội dung. Đã mở ' + this.expansions + ' mục thu gọn; chờ ' + seconds + ' giây…',
        'wait-video':'Đang chờ đúng video tải lên (' + seconds + ' / 60 giây)…',
        'wait-content':'Đang chờ đúng nội dung hiển thị (' + seconds + ' / 60 giây)…',
        viewing:'Đang hiển thị mục bắt buộc: '+this.target?.title+'. Giữ tab LMS ở phía trước; đang chờ phút do LMS xác nhận.',
        manual:this.needsReview
          ? 'LMS chưa ghi tăng phút sau 3 lần đọc lại và đã hết khoảng chờ theo ngưỡng. Kiểm tra điều kiện của mục này; bấm Kiểm tra trang để lấy báo cáo, rồi Đọc lại LMS khi đã xử lý.'
          : 'Mục này cần bạn thực hiện hoặc kiểm tra điều kiện: '+this.target?.title+'. Đọc nội dung và trả lời nếu có yêu cầu. Sau khi làm xong, bấm Đọc lại LMS để tiếp tục.',
        playing:'Đã quay lại tab; đang kiểm tra để tiếp tục phát video…',
        'await-play':'Video chưa chạy. Bấm Phát video này hoặc Play trên video để tiếp tục.'
      };
      if(this.phase==='retry-wait')messages[this.phase]='Đã chạy qua các mục khả dụng. Chờ '+Math.max(0,Math.ceil((this.retryAt-this.a.now())/1000))+' giây rồi thử lại một lượt các mục lỗi; chưa coi chúng là hoàn thành.';
      if(this.phase==='manual' && this.editing)messages[this.phase]='Bạn đang tương tác với biểu mẫu. Tool giữ trang để bảo vệ câu trả lời; làm xong bấm Đọc lại LMS để tiếp tục.';
      if(this.phase==='viewing' && this.continuous && this.target?.kind==='interactive')messages[this.phase]='Đang theo dõi mục '+this.target.title+' và tự đọc lại LMS theo ngưỡng phút. Nếu LMS chưa xác nhận, mục này được ghi lại để tiếp tục nội dung khác. Tool không trả lời hoặc nộp biểu mẫu.';
      if (messages[this.phase]) this.say(messages[this.phase]);
    }
    tick() {
      if (!this.running) return;
      const now = this.a.now();
      if (this.a.courseKey() !== this.course) {this.stop('Đã rời lớp học hoặc phiên đăng nhập hết hạn.'); return;}
      if (!this.a.foreground()) {
        this.lastEligibleAt=null;
        if (this.awayAt === null) this.awayAt = now;
        if (this.phase === 'playing') this.a.suspendPlayback();
        this.a.pauseCurrent();
        this.say('Đang chờ bạn quay lại tab LMS.'); return;
      }
      if (this.awayAt !== null) {
        const away = now - this.awayAt;
        for (const field of ['phaseAt', 'requestAt', 'stableAt', 'reviewAt', 'lastExpansionAt','pageMissingAt','retryAt','nextCheckAt','pollPausedAt','playMissingAt'])
          if (typeof this[field] === 'number') this[field] += away;
        this.awayAt = null;
        if(this.phase==='audit' && this.menuScanState) {
          for(const map of [this.menuScanState.attempts,this.menuScanState.emptySince])if(map)for(const [key,value] of map)map.set(key,value+away);
          if(typeof this.menuScanState.stableAt==='number')this.menuScanState.stableAt+=away;
          if(typeof this.menuScanState.missingSince==='number')this.menuScanState.missingSince+=away;
        }
        this.phaseMessage();
      }
      if(this.phase==='retry-wait') {
        this.phaseMessage();
        if(now>=this.retryAt) {
          for(const record of this.deferred.values())if(record.state==='retry-later') {
            record.state='retrying';this.pageChecks.set(record.key,0);this.thresholdChecks.set(record.key,0);this.attempts.delete(record.key);
          }
          this.muteTried=false;this.readProgress();
        }
        return;
      }
      if (['wait-video','wait-content'].includes(this.phase) && now-this.phaseAt>=750) {
        const blocked=this.a.blocker?.(this.target.title);
        if(blocked?.kind==='prerequisite'){this.waitForPrerequisites(blocked);return;}
        const unavailable=blocked?.message || this.a.availability?.(this.target.title);
        if(unavailable){this.fail('LMS chưa mở nội dung này. '+unavailable,false);return;}
      }
      // Inspect a verified native player before expiring a wait for a generic
      // page. The browser may deliver the first callback after the load budget.
      if(this.phase==='wait-content' && now-this.phaseAt>=750 && this.recognizeVideo())return;
      if(['audit','open'].includes(this.phase) && now-this.phaseAt>DISCOVERY_WAIT) {
        this.stop('Chưa kiểm tra xong cây menu sau 10 phút; không xác nhận đã hoàn thành. Bấm Kiểm tra trang để lấy báo cáo.');return;
      }
      if (!['playing','await-play','viewing','manual','audit'].includes(this.phase) && now - (this.phase==='open'?(this.lastExpansionAt ?? this.phaseAt):this.phaseAt) > PAGE_WAIT) {
        if(this.continuous && this.phase==='progress' && this.globalRetries++<2) {
          this.enter('refresh');this.say('Bảng LMS chưa tải xong; đang thử mở lại tab tiến trình ('+this.globalRetries+'/2)…');return;
        }
        if(this.phase==='progress' || this.phase==='content' || this.phase==='audit-content' || this.phase==='refresh') {
          this.stop('Không đọc/mở được tab lớp sau 1 phút. Kiểm tra kết nối hoặc phiên đăng nhập.');return;
        }
        this.fail(['wait-video','wait-content'].includes(this.phase)
          ? 'Chưa xác nhận được đúng nội dung đã mở. Bấm Kiểm tra trang và gửi báo cáo để điều chỉnh nhận diện.'
          : this.phase==='open' ? 'Menu không có tiến triển trong 1 phút. Bấm Kiểm tra trang để lấy đối chiếu các mục con.'
          : 'Không đọc/mở được bài sau 1 phút. Kiểm tra kết nối, tab Nội dung và Tiến trình học tập.'); return;
      }
      if (this.phase === 'progress') {
        this.a.pauseCurrent();
        if (!this.requested && !this.handleView(this.a.progressTab(), 'Tiến trình học tập')) return;
        const report = this.a.progress();
        if (report.kind === 'ambiguous' || report.kind === 'invalid') {
          this.stop(report.message || 'Có nhiều bảng tiến trình; cần xác định bảng của lớp đang mở.'); return;
        }
        if (report.kind !== 'ready') return;
        this.report = report; this.reportAt = now; this.a.reported?.(report);
        if (report.signature !== this.signature) {this.signature = report.signature; this.stableAt = now; return;}
        if (now - this.stableAt < STABLE_WAIT || now - this.requestAt < STABLE_WAIT) return;
        this.choose(report); return;
      }
      if (this.phase === 'refresh') {
        this.phaseMessage();
        if (!this.requested && !this.handleView(this.a.contentTab(), 'Nội dung')) return;
        this.a.pauseCurrent();
        if (now - this.requestAt >= 1000) this.readProgress();
        return;
      }
      if(this.phase==='audit-content') {
        this.phaseMessage();this.a.pauseCurrent();
        if(!this.requested && !this.handleView(this.a.contentTab(),'Nội dung'))return;
        if(now-this.requestAt>=500)this.enter('audit');return;
      }
      if(this.phase==='audit') {
        this.phaseMessage();this.a.pauseCurrent();
        const audit=this.a.scanMenu(this.menuScanState);
        if(audit.kind!=='ready')return;
        this.menuAudit={available:audit.available,items:audit.items,expanded:audit.expanded,
          blocked:audit.blocked.map(({title,path,key,reason})=>({title,path,key,reason}))};
        this.auditSignature=this.completionSignature;this.readProgress(true);return;
      }
      if (this.phase === 'content') {
        this.phaseMessage();
        if (!this.requested && !this.handleView(this.a.contentTab(), 'Nội dung')) return;
        this.captureBaseline();
        this.a.pauseCurrent();
        if (now - this.requestAt >= 500) this.enter('open');
        return;
      }
      if (this.phase === 'open') {
        this.phaseMessage();
        this.a.pauseCurrent();
        const video = this.target.kind==='video';
        const mediaBefore=this.a.baseline?.() || this.a.snapshot() || this.baseline;
        const before = video ? mediaBefore : this.a.pageBaseline?.() || this.pageBaseline;
        const selectedBefore = this.a.selected(this.target.title,this.target);
        // After a progress check, do not reload an already selected, previously
        // verified lesson. Retain the native position when LMS retains its player.
        const known=this.knownPages.get(this.target.key);
        const active = selectedBefore && (video ? before?.source && this.knownSources.get(this.target.key) === before.source
          : before?.ready && this.samePage(before,known));
        const outcome = active ? 'active' : this.a.openItem(this.target.title, {...this.target, attempted:this.attemptedFolders,expandedPaths:this.expandedPaths});
        if (outcome === 'clicked' || outcome === 'active') {
          this.before = mediaBefore ? {video:mediaBefore.video,source:mediaBefore.source} : null;
          this.beforePage = !video ? before : null;
          this.selectedBefore = selectedBefore;
          this.enter(video?'wait-video':'wait-content'); return;
        }
        if (outcome === 'expanded') {
          this.expansions++;this.lastExpansionAt = now;return;
        }
        if (outcome === 'expanding') {
          if (now - this.lastExpansionAt < 5000) {this.say('Đã bấm mở mục; đang chờ danh sách bài xuất hiện…'); return;}
          this.fail('Mục thu gọn chưa mở sau 5 giây. Bấm mũi tên trong menu bên trái rồi Bắt đầu lại.'); return;
        }
        if (outcome === 'missing') {
          if (now - (this.lastExpansionAt ?? this.phaseAt) < 15000) return;
          this.fail('Chưa tìm thấy liên kết của mục đã chọn. Mở mục chứa bài trong menu bên trái, rồi Bắt đầu. Bấm Kiểm tra trang nếu vẫn lỗi.'); return;
        }
        this.fail(outcome === 'ambiguous' ? 'Có nhiều liên kết nội dung trùng tên; chưa xác định được bài đúng.'
          : outcome === 'disabled' ? 'Mục bắt buộc chưa hoàn thành đầu tiên đang bị khóa. Hoàn thành điều kiện mở bài trên LMS.'
          : 'Nội dung nằm trong mục đang thu gọn. Mở rộng mục chứa bài, rồi bấm Bắt đầu.',true,
          outcome==='disabled'?{waitFor:'unlock',completionSignature:this.completionSignature}:{}); return;
      }
      if (this.phase === 'wait-content') {
        this.phaseMessage();this.a.pauseCurrent();
        const item=this.a.pageSnapshot?.(this.target.title,this.target.kind==='interactive');
        if (!item?.ready || now-this.phaseAt<750)return;
        const before=this.beforePage,known=this.knownPages.get(this.target.key);
        const identified=!before || before.element!==item.element || before.marker!==item.marker ||
          this.selectedBefore || this.samePage(item,known);
        if(!identified)return;
        this.rememberPage(item);this.pageMissingAt=null;
        this.a.ensureVisible?.();
        if(this.continuous && this.target.requiredMinutes===null && !this.editing) {
          this.defer('Đã mở nội dung nhưng chưa đọc được ngưỡng phút; cần kiểm tra hoặc thực hiện yêu cầu trên LMS.',false);return;
        }
        this.enter(this.editing || this.needsReview || !this.continuous && this.target.kind==='interactive' || this.target.requiredMinutes===null ? 'manual' : 'viewing');
        if(this.phase==='viewing'){this.beginAttempt();this.scheduleCheck();}else this.clearCheck();
        this.phaseMessage();return;
      }
      if (this.phase === 'viewing' || this.phase === 'manual') {
        if(this.phase==='viewing')this.a.pauseCurrent();
        const item=this.a.pageSnapshot?.(this.target.title,this.target.kind==='interactive');
        if(!item?.ready){
          this.lastEligibleAt=null;
          if(this.pageMissingAt==null)this.pageMissingAt=now;
          if(now-this.pageMissingAt>3000)this.fail('Không còn xác nhận được nội dung đang hiển thị. Bấm Kiểm tra trang rồi Bắt đầu lại.');
          return;
        }
        this.pageMissingAt=null;this.rememberPage(item);
        this.phaseMessage();
        if(this.phase==='viewing'){this.noteEligible();if(this.checkDue())this.recheck('timer');}
        return;
      }
      if (this.phase === 'wait-video') {
        this.phaseMessage();
        const item = this.a.snapshot();
        this.a.pauseCurrent();
        if (!item?.source || now - this.phaseAt < 750) return;
        if (this.target.titleDuplicate && !this.a.selected(this.target.title,this.target)) return;
        // A newly active sidebar label may precede the asynchronous source swap.
        // It is usable with an unchanged source only if it was already selected.
        const identified = !this.before || item.source !== this.before.source ||
          (this.selectedBefore && this.a.selected(this.target.title,this.target)) ||
          this.knownSources.get(this.target.key) === item.source;
        if (!identified) return;
        this.a.ensureVisible?.();
        if(this.continuous && this.target.requiredMinutes===null) {
          this.defer('Đã mở video nhưng chưa đọc được ngưỡng phút; cần kiểm tra điều kiện trên LMS.',false);return;
        }
        if (item.ready && item.video.ended) {
          if (!this.rewound) {
            try {item.video.currentTime = 0; this.rewound = true;} catch (_) {this.fail('Không phát lại được video chưa hoàn thành. Bấm Play rồi Bắt đầu.');}
          }
          return;
        }
        this.source = item.source; this.knownSources.set(this.target.key, item.source); this.enter('playing');
        this.beginAttempt();this.scheduleCheck();
        if (this.awaitUser) {this.waitForPlay();return;}
        this.a.beginPlayback();
        this.handlePlaybackStopped();
        return;
      }
      if (this.phase === 'await-play') {
        const item = this.a.snapshot();
        if(!item) {
          if(this.playMissingAt===null)this.playMissingAt=now;
          if(now-this.playMissingAt>=3000)this.fail('Trình phát đã biến mất trong lúc chờ Play; chưa thể phát mục này.');
          return;
        }
        this.playMissingAt=null;
        if (item && item.source !== this.source) {this.fail('Video đã thay đổi. Bấm Bắt đầu để chọn lại.');return;}
        if (item?.video.error) {this.fail('Video bị lỗi tải (mã ' + item.video.error.code + '). Kiểm tra video trên LMS.');return;}
        if (this.target.titleDuplicate && !this.a.selected(this.target.title,this.target)) {
          this.fail('Mục chứa video trùng tên đã thay đổi. Bấm Bắt đầu để chọn lại.');return;
        }
        if (item?.ready && !item.video.paused && !item.video.ended) this.resumeWithGesture();
        return;
      }
      if (this.phase === 'playing') {
        const item = this.a.snapshot();
        if (!item) this.a.pauseCurrent();
        if (item && item.source !== this.source) {
          this.fail('Bạn đã chuyển sang bài khác. Bấm Bắt đầu để chọn lại video chưa hoàn thành.'); return;
        }
        if (this.target.titleDuplicate && !this.a.selected(this.target.title,this.target)) {
          this.fail('Mục chứa video trùng tên đã thay đổi. Bấm Bắt đầu để chọn lại.');return;
        }
        if (!this.a.playbackRunning()) {this.handlePlaybackStopped();return;}
        if(item?.ready && item.video.paused && !item.video.ended) {
          this.lastEligibleAt=null;if(this.pollPausedAt===null)this.pollPausedAt=now;return;
        }
        if(this.pollPausedAt!==null) {
          if(this.nextCheckAt!==null)this.nextCheckAt+=now-this.pollPausedAt;
          this.pollPausedAt=null;
        }
        if (item?.ready && !item.video.paused && !item.video.ended) {
          this.noteEligible();if(this.checkDue(this.a.playbackAdvancing?.()!==false))this.recheck('timer');
        }else this.lastEligibleAt=null;
      }
    }
  };
})();
