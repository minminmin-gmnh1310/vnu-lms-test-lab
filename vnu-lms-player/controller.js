/* Playback state machine. It never writes LMS progress or makes HTTP requests. */
const VnuPlayer = (() => {
  'use strict';
  const LIMITS = {load:120000, navigation:30000, missing:3000, stalled:90000};
  return class VnuPlayer {
    constructor(adapter) {
      this.a=adapter; this.running=false; this.state='idle'; this.item=null;
      this.generation=0; this.pending=null; this.serial=0; this.latest=new WeakMap();
      this.needsPlay=false; this.hiddenSince=null; this.lastTime=0;
      this.loadAt=0; this.motionAt=0; this.missingAt=null; this.navigationAt=0;
      this.previous=null; this.finished=0; this.autoplayBlocked=false;
      this.say('Mở một video rồi bấm Bắt đầu.');
    }
    say(message) {this.a.status(message, this.running);}
    pause(video) {if (video && !video.paused) video.pause();}
    start() {
      if (this.running) return;
      const item=this.a.snapshot();
      if (!item) {this.say('Mở một bài video trước khi Bắt đầu.');return;}
      if (item.ready && item.video.ended) {this.say('Video đã kết thúc. Mở video tiếp theo rồi Bắt đầu.');return;}
      this.autoplayBlocked=false; this.running=true; this.hiddenSince=null; this.bind(item);
      // A native Play click has already started playback. Adopt it without a
      // second play() call, so browser user activation is not lost or restarted.
      if(item.ready && !item.video.paused){this.needsPlay=false;this.state='playing';}
      this.tick();
    }
    stop(message='Đã dừng. Bấm Bắt đầu để tiếp tục.') {
      this.running=false; this.state='idle'; this.generation++;
      this.pending=null; this.needsPlay=false; this.hiddenSince=null;
      this.pause(this.item?.video);
      const current=this.a.snapshot();
      if (current?.video!==this.item?.video) this.pause(current?.video);
      this.say(message);
    }
    bind(item) {
      // Invalidate earlier play() promises, including when the element is reused.
      if (this.item?.video!==item.video) this.pause(this.item?.video);
      this.generation++; this.pending=null; this.item=item; this.state='loading';
      this.needsPlay=true; this.missingAt=null;
      this.loadAt=this.motionAt=this.a.now(); this.lastTime=item.video.currentTime;
    }
    same(a,b) {return !!a && !!b && a.video===b.video && a.source===b.source;}
    updateForeground(now, current) {
      if (!this.a.foreground()) {
        if (this.hiddenSince===null) this.hiddenSince=now;
        if (this.item?.video && !this.item.video.paused && !this.item.video.ended) {
          this.needsPlay=true; this.pause(this.item.video);
        }
        if (current && !this.same(current,this.item)) this.pause(current.video);
        this.say('Đang chờ bạn quay lại tab LMS.');return false;
      }
      if (this.hiddenSince!==null) {
        const away=now-this.hiddenSince;
        this.loadAt+=away; this.motionAt+=away; this.navigationAt+=away;
        if (this.missingAt!==null) this.missingAt+=away;
        this.hiddenSince=null;
      }
      return true;
    }
    attemptPlay() {
      if (!this.running || !this.a.foreground() || !this.item || this.pending) return;
      const item=this.item, generation=this.generation;
      const attempt={id:++this.serial, item, generation};
      this.pending=attempt; this.latest.set(item.video,attempt.id);
      this.needsPlay=false;
      let result;
      try {item.video.playbackRate=1; result=item.video.play();}
      catch(error) {this.settle(attempt,error,true);return;}
      Promise.resolve(result).then(()=>this.settle(attempt,null),error=>this.settle(attempt,error,true));
    }
    settle(attempt,error,failed=false) {
      const {item,generation,id}=attempt;
      const active=this.running && this.generation===generation && this.same(this.item,item);
      if (this.pending===attempt) this.pending=null;
      if (!active) {
        // An old promise must not pause a newly started run on the same element.
        if (this.latest.get(item.video)===id && !(this.running && this.item?.video===item.video)) this.pause(item.video);
        return;
      }
      const current=this.a.snapshot();
      if (!this.a.foreground() || !this.same(current,item)) {
        this.needsPlay=true; this.pause(item.video);return;
      }
      if (!failed) {this.state='playing';this.motionAt=this.a.now();return;}
      const errorName=error?.name || 'lỗi tải';
      if (errorName==='AbortError') {
        if (current.ready && current.video.paused) {
          // A user can press native Pause while play() is still pending.
          // Do not restart a fully loaded video after that interruption.
          this.state='playing'; this.needsPlay=false; this.motionAt=this.a.now();
          this.say('Video đang tạm dừng. Bấm Play trên video để tiếp tục.');return;
        }
        this.needsPlay=true; this.say('Video đang thay nguồn hoặc tải lại; đang chờ…');return;
      }
      if (errorName==='NotAllowedError') {
        this.autoplayBlocked=true;
        this.stop('Trình duyệt chặn tự phát. Bấm Phát video này hoặc Play trên video để tiếp tục.');return;
      }
      this.stop('Không phát được video ('+errorName+'). Kiểm tra video rồi Bắt đầu lại.');
    }
    next(now) {
      if (this.a.ended) {
        // Course mode reviews LMS completion instead of blindly clicking Next.
        this.finished++; this.running=false; this.state='idle'; this.generation++;
        this.pending=null; this.needsPlay=false; this.pause(this.item?.video);
        this.a.ended(this.item);return;
      }
      this.finished++; this.state='transition'; this.previous=this.item;
      this.navigationAt=now; this.generation++; this.pending=null; this.needsPlay=false;
      this.say('Đã phát hết '+this.finished+' video. Đang chờ bài tiếp theo…');
      try {
        const outcome=this.a.next();
        if (outcome!=='clicked') this.stop(outcome==='none'
          ? 'Hết danh sách hoặc bài tiếp theo bị khóa. Hãy kiểm tra trên LMS.'
          : 'Có nhiều nút Tiếp theo. Chuyển bài thủ công rồi Bắt đầu.');
      } catch (_) {this.stop('Chưa chuyển được bài. Chuyển thủ công rồi Bắt đầu.');}
    }
    tick() {
      if (!this.running) return;
      const now=this.a.now(), current=this.a.snapshot();
      if (!this.updateForeground(now,current)) return;
      if (!this.a.inCourse()) {this.stop('Đã rời trang học hoặc phiên đăng nhập hết hạn.');return;}
      if (this.state==='transition') {
        if (current && current.source===this.previous.source) this.pause(current.video);
        if (current && !this.same(current,this.previous)) {
          // Angular may mount a new element with the previous source first.
          // Do not count that ended video as another completed lesson.
          if (current.source && current.source!==this.previous.source) {this.bind(current);this.tick();return;}
          this.pause(current.video);
          if (current.video.error && now-this.navigationAt>LIMITS.missing) {
            this.stop('Video bài tiếp theo bị lỗi tải. Kiểm tra video trên LMS.');return;
          }
        }
        if (now-this.navigationAt>LIMITS.navigation) {
          this.stop('Bài tiếp theo không có video, bị khóa hoặc chưa tải. Mở video tiếp theo rồi Bắt đầu.');
        }
        return;
      }
      if (!current) {
        if (this.missingAt===null) this.missingAt=now;
        this.say('Đang chờ trang tải video…');
        if (now-this.missingAt>LIMITS.missing) this.stop('Trang hiện tại không có video. Mở video tiếp theo rồi Bắt đầu.');
        return;
      }
      this.missingAt=null;
      if (!this.same(current,this.item)) this.bind(current);
      if (current.video.error) {this.stop('Video bị lỗi tải (mã '+current.video.error.code+'). Kiểm tra mạng hoặc tải lại bài.');return;}
      if (!current.ready && this.state==='playing') {
        // Rebuffering after a long lecture needs a fresh wait budget.
        this.state='buffering'; this.loadAt=now;
      }
      if (this.state==='loading' || this.state==='buffering' || !current.ready) {
        if (now-this.loadAt>LIMITS.load) {this.stop('Video chưa phát được sau 2 phút chờ. Kiểm tra mạng rồi Bắt đầu lại.');return;}
        if (!current.ready) {
          // preload="none" needs play() to start fetching. When Angular has
          // declared a new source but the old resource remains loaded, wait
          // rather than accidentally playing the old lecture again.
          if (this.needsPlay && current.canPlay!==false && current.source) this.attemptPlay();
          if (!this.running) return;
          this.say('Đang tải video…');return;
        }
        if (this.state==='buffering') {this.state='playing';this.motionAt=now;}
        if (this.needsPlay) this.attemptPlay();
        if (!this.running) return;
        if (this.state==='loading') {this.say('Đang bắt đầu phát video…');return;}
      }
      if (current.video.ended) {this.next(now);return;}
      if (this.needsPlay) {this.attemptPlay();return;}
      if (this.pending) {
        if (now-this.motionAt>LIMITS.load) this.stop('Video không bắt đầu phát. Bấm Play rồi thử lại.');
        return;
      }
      if (current.video.paused) {
        this.motionAt=now;this.lastTime=current.video.currentTime;
        this.say('Video đang tạm dừng. Bấm Play trên video để tiếp tục.');return;
      }
      // A backward seek changes the baseline rather than triggering a false stall.
      if (Math.abs(current.video.currentTime-this.lastTime)>0.05) {
        this.motionAt=now;this.lastTime=current.video.currentTime;
      }
      if (now-this.motionAt>LIMITS.stalled) {this.stop('Video đứng trong 90 giây. Kiểm tra mạng rồi Bắt đầu lại.');return;}
      // Keep this player's documented 1× behavior, including after native controls change it.
      if (current.video.playbackRate!==1) current.video.playbackRate=1;
      if (now-this.motionAt>8000) {
        this.say('Video chưa tiến thêm trong '+Math.floor((now-this.motionAt)/1000)+' giây; đang chờ tải. Bộ đếm phát tại máy đang đứng.');return;
      }
      this.say('Đang phát '+VnuPlayer.format(current.video.currentTime)+' / '+VnuPlayer.format(current.video.duration)+' · Đã phát hết '+this.finished+' video.');
    }
    static format(value) {return Number.isFinite(value)?Math.floor(value/60)+':'+String(Math.floor(value%60)).padStart(2,'0'):'--:--';}
  };
})();

/* Observed 1x movement for estimates/read deadlines, never claims LMS credit. */
const VnuWatchClock = class {
  constructor() {this.reset();}
  reset() {this.records = new Map(); this.last = null;}
  record(key) {
    if (!this.records.has(key)) this.records.set(key, {seconds:0, unconfirmed:0, minutes:null});
    return this.records.get(key);
  }
  reported(key, minutes) {
    const r = this.record(key);
    if (!Number.isFinite(minutes) || minutes < 0) return;
    if (r.minutes !== null) {
      if (minutes < r.minutes) r.unconfirmed = 0;
      else r.unconfirmed = Math.max(0, r.unconfirmed - (minutes - r.minutes) * 60);
    }
    r.minutes = minutes;
  }
  interrupt() {this.last = null;}
  page(key, item, now, active) {
    // Loading checks still use the full content marker. The reading clock uses
    // a stable lesson/source identity so counters or live text cannot reset it.
    const marker=item?.clockMarker ?? item?.marker;
    const current=active && item?.ready ? {kind:'page',key,element:item.element,marker,now} : null;
    const old=this.last;this.last=current;
    if(!current || old?.kind!=='page' || old.key!==key || old.element!==item.element || old.marker!==marker)return;
    const wall=(now-old.now)/1000;
    if(wall<=0 || wall>5)return;
    const r=this.record(key);r.seconds+=wall;r.unconfirmed+=wall;
  }
  sample(key, item, now, active) {
    const v = item?.video;
    const valid = !!key && !!v && item.ready && Number.isFinite(v.currentTime) &&
      active && !v.seeking && !v.error && v.playbackRate === 1;
    const current = valid ? {key, video:v, source:item.source, now, time:v.currentTime,
      advancing:!v.paused && !v.ended} : null;
    const old = this.last;
    this.last = current;
    if (!current || !old || old.kind==='page' || !old.advancing || old.key !== key || old.video !== v ||
        old.source !== item.source) return;
    const wall = (now - old.now) / 1000, movement = current.time - old.time;
    // Long gaps can be sleep/throttling. Forward seeks are not watched time.
    if (wall <= 0 || wall > 5 || movement <= 0 || movement > wall + 0.75) return;
    const counted = Math.min(wall, movement), r = this.record(key);
    r.seconds += counted; r.unconfirmed += counted;
  }
};
