/* =====================================================================
 * 宇哥 vs 检哥 · 赛博回合制对战（纯 HTML + CSS + 原生 JS，双击即玩）
 *
 * 代码结构（分层清晰）：
 *   一、素材配置区（头像 / 大招素材 / 音效映射）—— 想换素材只看这里
 *   二、角色与技能数据配置
 *   三、工具函数
 *   四、音效管理（AudioManager）
 *   五、战斗引擎（Battle：回合 / 能量 / 状态 / 伤害结算）
 *   六、演出层（飘字 / 震动 / 闪白 / 大招演出 / Canvas 粒子）
 *   七、UI 渲染
 *   八、AI 逻辑
 *   九、初始化与事件绑定
 * ===================================================================== */

'use strict';

/* =====================================================================
 * 一、素材配置区
 * ===================================================================== */

// ---- 头像素材（可自由替换为你自己的图片，路径相对 index.html）----
const AVATARS = {
  yuge:   'l.jpg',   // 宇哥头像
  jiange: 'j.jpg',   // 检哥头像
};

// =====================================================================
// ★★★ 宇哥大招素材加载接口（核心特殊要求）★★★
// ---------------------------------------------------------------------
// 当前素材：静态图片 p.jpg（全屏「大招演出模式」：黑幕 + ken-burns
// 缩放 + 白闪 + 震动，演出结束后才结算伤害）。
//
// 想换成你自己的素材，改下面 ULT_ASSET 即可，三种模式任选：
//   1) 视频（推荐）：type: 'video'，src 填视频路径（mp4/webm）。
//      游戏会使用 <video> 标签全屏播放，监听 ended 事件，
//      「素材播放完毕后才结算伤害」。
//   2) 图片序列帧：type: 'frames'，frames 填帧图片路径数组，
//      按 frameInterval 逐帧切换。
//   3) 单张大图：type: 'image'（默认），duration 控制演出时长。
//
// TODO: 强制替换为宇哥大招专属素材路径@p.jpg ，并确保素材播放完毕后再结算伤害。
// =====================================================================
const ULT_ASSET = {
  type: 'image',             // 'image' | 'video' | 'frames'
  src: 'p.jpg',              // TODO: 强制替换为宇哥大招专属素材路径@p.jpg
  frames: [],                // 序列帧模式：['frame1.png', 'frame2.png', ...]
  frameInterval: 100,        // 序列帧切换间隔（毫秒）
  duration: 3400,            // image / frames 模式的演出时长（毫秒）
  videoFallbackTimeout: 8000 // 视频模式兜底：超过该时长强制结束演出，避免卡死
};

// ---- 音效映射（你提供的 9 个音效文件全部用上了）----
const AUDIO_FILES = {
  ui_click:     'poka02.mp3',       // 界面点击 / 检哥精准打击（"嗒"一声，很搭）
  battle_start: 'running1.mp3',     // 战斗开始：冲刺进场
  low_hp:       'heartbeats.mp3',   // 角色血量告急的心跳声
  yuge_atk:     'funny.mp3',        // 宇哥平A：搞怪音效
  yuge_buff:    'powerup01.mp3',    // 志哥之怒：能量提升
  yuge_ult:     'atomic_bomb.mp3',  // 宇哥大招：核爆！
  jiange_atk:   'poka02.mp3',       // 精准打击
  jiange_gaze:  'blackout3.mp3',    // 检哥的凝视：断片/黑屏氛围
  jiange_ult:   'powerdown01.mp3',  // 绝对检阅：力量清算
  hit_p1:       'endless_farts.mp3',// 宇哥受击：放屁搞笑音
  hit_p2:       'funny.mp3',        // 检哥受击
};

/* =====================================================================
 * 二、角色与技能数据配置
 * ===================================================================== */

// 角色基础配置（纯数据，不含运行时状态）
const CHARACTER_DATA = {
  yuge: {
    id: 'yuge', name: '宇哥', role: '高爆发 · 视觉系', color: '#ffb300',
    avatar: AVATARS.yuge, hpMax: 1100, def: 25,
    desc: '主打爆发与暴击，血越少大招越痛'
  },
  jiange: {
    id: 'jiange', name: '检哥', role: '控制 · 策略型', color: '#22d3ee',
    avatar: AVATARS.jiange, hpMax: 1250, def: 45,
    desc: '坦克控制位，受击越多大招越强（伤害审计）'
  },
};

// 技能定义：execute 为 async 函数，负责演出 + 结算（this 指向 Battle）
const SKILLS = {

  /* ---------- 宇哥技能 ---------- */

  // 普攻【平A】：基础物理伤害，15% 暴击（×1.8）
  yuge_basic: {
    name: '平A', cost: 10, cd: 0, kind: 'basic', icon: '👊',
    desc: '55~80 物理 · 15%暴击 · 耗10能量',
    async execute(c, foe) {
      const buff = c.status.critBuff;               // 是否处于「志哥之怒」状态
      const isCrit = buff ? true : Math.random() < 0.15;
      const raw = randInt(55, 80);
      lungeChar(c);                                  // 出手突进动画
      audio.play('yuge_atk');
      await sleep(430);
      const final = Battle.applyDamage(c, foe, raw, { type: 'physical', isCrit });
      if (buff) {                                    // 志哥之怒：命中后触发持续灼烧（40/回合）
        foe.status.burn = { turns: 3, dmg: 40 };
        delete c.status.critBuff;
        Battle.addLog(`🔥【志哥之怒】触发！${foe.name} 被灼烧（40/回合 × 3）`, 'buff');
      }
      Battle.addLog(`${c.name} 平A 命中 ${foe.name}，${final > 0 ? `造成 ${final} 点伤害` : '伤害被护盾完全格挡'}${isCrit && final > 0 ? '（暴击！）' : ''}`, isCrit ? 'crit' : 'dmg');
      await sleep(620);
    }
  },

  // 小技能【志哥之怒】：消耗 30 能量，立即造成 140 直接伤害，
  // 并使下一次攻击必定暴击并附加持续灼烧（40/回合 × 3）
  yuge_skill: {
    name: '志哥之怒', cost: 30, cd: 1, kind: 'skill', icon: '🔥',
    desc: '立即140伤 + 必暴击 + 灼烧40×3（CD 1）',
    async execute(c, foe) {
      c.status.critBuff = { burn: { turns: 3, dmg: 40 } };
      audio.play('yuge_buff');
      // 直接伤害：怒吼震慑，立即造成 140 点真实伤害（无视防御）
      const dmg = Battle.applyDamage(c, foe, 140, { type: 'true', isCrit: false });
      Battle.addLog(`💥 ${c.name} 怒吼震慑 ${foe.name}，立即造成 ${dmg} 点直接伤害！`, 'dmg');
      Battle.addLog(`🔥 ${c.name} 怒吼！下一次攻击必定暴击并附带持续灼烧（40/回合 × 3）！`, 'buff');
      spawnFloat(window.innerWidth / 2 - 40, window.innerHeight * 0.3, '⚡ 必暴击蓄力', 'state');
      await sleep(750);
    }
  },

  // 大招【宇哥降临】：切入全屏「大招演出模式」播放素材，
  // 素材播放完毕后结算巨额伤害（必暴击、无视 60% 防御、血越少越痛）
  yuge_ult: {
    name: '宇哥降临', cost: 90, cd: 2, kind: 'ult', icon: '🌌',
    desc: '鸟都不鸟你（CD 2）',
    async execute(c, foe) {
      // ---- 进入「大招演出模式」：全屏遮罩 + 特写镜头，播放素材 ----
      // 该 Promise 在素材播放完毕（视频 ended / 图片演出结束）后才 resolve
      await playUltCutscene('宇 哥 降 临');

      // ★★★ 素材播放完毕，现在才结算伤害 ★★★
      // TODO: 强制替换为宇哥大招专属素材路径@p.jpg ，并确保素材播放完毕后再结算伤害。
      const missing = c.hpMax - c.hp;                 // 已损失血量
      // 基础伤害 × 0.75：满血时最终伤害约 450 点（血越少伤害越高，斩杀机制保留）
      const raw = Math.round((400 + missing * 0.4) * 0.75);
      const final = Battle.applyDamage(c, foe, raw, {
        type: 'physical', isCrit: true, ignoreDefRatio: 0.6
      });
      if (c.status.critBuff) {                        // 与志哥之怒联动：追加灼烧
        foe.status.burn = { turns: 3, dmg: 40 };
        delete c.status.critBuff;
        Battle.addLog(`🔥 降临余威灼烧 ${foe.name}（40/回合 × 3）`, 'buff');
      }
      Battle.addLog(`🌌 ${c.name} 降临！对 ${foe.name} 造成 ${final} 点巨额伤害（必暴击）！`, 'ult');
      await sleep(650);
    }
  },

  /* ---------- 检哥技能 ---------- */

  // 普攻【精准打击】：稳定中等伤害，无暴击（稳定即风格）
  jiange_basic: {
    name: '精准打击', cost: 10, cd: 0, kind: 'basic', icon: '🎯',
    desc: '65~90 物理 · 稳定 · 耗10能量',
    async execute(c, foe) {
      const raw = randInt(65, 90);
      lungeChar(c);
      audio.play('jiange_atk');
      await sleep(430);
      const final = Battle.applyDamage(c, foe, raw, { type: 'physical', isCrit: false });
      Battle.addLog(`🎯 ${c.name} 精准打击 ${foe.name}，${final > 0 ? `造成 ${final} 点伤害` : '伤害被护盾完全格挡'}`, 'dmg');
      await sleep(620);
    }
  },

  // 小技能【检哥的凝视】：眩晕敌人 1 回合 + 降低其 30% 防御（2 回合）+ 少量真实伤害
  jiange_skill: {
    name: '检哥的凝视', cost: 30, cd: 1, kind: 'skill', icon: '👁️',
    desc: '眩晕1回合 · 减防30%（CD 1）',
    async execute(c, foe) {
      audio.play('jiange_gaze');
      // 全屏一瞬的"凝视"特效（青色横向扫描光）
      flashScreen('rgba(34,211,238,0.35)');
      spawnFloat(window.innerWidth / 2, window.innerHeight * 0.32, '👁️ 检哥的凝视', 'state');
      await sleep(600);
      const dmg = Battle.applyDamage(c, foe, 20, { type: 'true', isCrit: false });
      foe.status.stun = { turns: 1 };                        // 眩晕 1 回合（跳过其下一次行动）
      foe.status.defDown = { turns: 2, ratio: 0.3 };         // 防御 -30% × 2 回合
      Battle.addLog(`👁️ ${foe.name} 被凝视：眩晕 1 回合、防御 -30%（2 回合），并受 ${dmg} 点真实伤害`, 'debuff');
      await sleep(650);
    }
  },

  // 大招【绝对检阅】：真实伤害 = 160 + 本场累计承受伤害 × 50%
  // （"审计"主题：挨的打越多，回敬越狠，专克宇哥爆发），
  // 并给自己护盾（伤害 25%）+ 削弱对方攻击 20%（2 回合）
  // + 对敌方施加【审计追缴】持续掉血（每回合 -44 血 × 5 回合）
  jiange_ult: {
    name: '绝对检阅', cost: 110, cd: 2, kind: 'ult', icon: '📋',
    desc: '各就各位（CD 2）',
    async execute(c, foe) {
      audio.play('jiange_ult');
      // 华丽特效：全屏 Canvas 粒子（青色/紫色"审计数据流"）+ 巨字 + 震动
      await Fx.burstAudit();
      const final = Math.round(160 + c.dmgTaken * 0.5);     // 真实伤害，无视防御
      const dealt = Battle.applyDamage(c, foe, final, { type: 'true', isCrit: false });
      c.shield += Math.round(dealt * 0.25);                 // 护盾 = 本次伤害 25%
      foe.status.weak = { turns: 2, ratio: 0.2 };           // 削弱对方攻击
      // 审计追缴：对敌方施加持续掉血 buff（回合制中"5秒"以"5 回合"实现，每回合 -44 血）
      foe.status.bleed = { turns: 5, dmg: 44 };
      Battle.addLog(`📋【绝对检阅】结算：累计受击 ${c.dmgTaken}，造成 ${dealt} 点真实伤害！${c.name} 获得护盾 ${Math.round(dealt * 0.25)} 点`, 'ult');
      Battle.addLog(`💤 ${foe.name} 被削弱：攻击 -20%（2 回合）`, 'debuff');
      Battle.addLog(`🩸 ${foe.name} 被标记【审计追缴】：每回合 -44 血，持续 5 回合`, 'debuff');
      await sleep(650);
    }
  },
};

/* =====================================================================
 * 三、工具函数
 * ===================================================================== */

const $ = (id) => document.getElementById(id);   // 获取元素快捷方式
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =====================================================================
 * 四、音效管理
 * ===================================================================== */

const audio = {
  muted: false,
  _cache: {},
  play(name, volume = 1) {
    if (this.muted) return;
    try {
      if (!this._cache[name]) this._cache[name] = new Audio(AUDIO_FILES[name]);
      const a = this._cache[name];
      a.volume = volume;
      a.currentTime = 0;
      a.play().catch(() => { /* 自动播放策略拦截时静默忽略 */ });
    } catch (e) { /* 音频异常不影响游戏 */ }
  }
};

/* =====================================================================
 * 五、战斗引擎
 * ===================================================================== */

const Battle = {
  mode: 'ai',          // 'ai' 人机 | 'pvp' 本地双人
  p1: null, p2: null,  // 运行时角色状态
  turnId: 'p1',        // 当前行动方
  round: 0,            // 回合数（双方各行动一次 = 1 回合）
  over: false,         // 战斗是否结束
  busy: false,         // 演出/动画进行中，禁止操作

  // 当前行动方 / 对手
  get active() { return this.turnId === 'p1' ? this.p1 : this.p2; },
  get foe()    { return this.turnId === 'p1' ? this.p2 : this.p1; },
  charBySlot(slot) { return slot === 'p1' ? this.p1 : this.p2; },

  // 创建角色运行时状态（数据与配置分离）
  makeState(dataId, slot, isAI) {
    const d = CHARACTER_DATA[dataId];
    return {
      slot, dataId, isAI,
      name: d.name, role: d.role, color: d.color, avatar: d.avatar,
      hpMax: d.hpMax, hp: d.hpMax,
      energy: 0, energyMax: 110,      // 能量上限 110（检哥大招需要 110 能量）
      def: d.def,
      shield: 0,                 // 护盾值
      dmgTaken: 0,               // 本场累计承受伤害（绝对检阅审计用）
      lowHpPlayed: false,        // 心跳音效是否已播
      alive: true,
      status: {},                // burn / stun / defDown / weak / critBuff
      cd: {},                    // 技能冷却表：{ 技能id: 剩余冷却回合 }
    };
  },

  // 初始化/重置一局战斗
  // mode: 'ai' 人机 | 'pvp' 本地双人
  // aiSide: 'jiange'（AI 控制检哥，玩家玩宇哥）| 'yuge'（AI 控制宇哥，玩家玩检哥）
  start(mode, aiSide) {
    this.mode = mode;
    this.aiSide = aiSide || 'jiange';
    const aiIsJiange = this.aiSide === 'jiange';   // AI 控制哪一方
    this.p1 = this.makeState('yuge', 'p1', mode === 'ai' && !aiIsJiange);
    this.p2 = this.makeState('jiange', 'p2', mode === 'ai' && aiIsJiange);
    this.turnId = 'p1';
    this.round = 1;              // 从第 1 回合开始显示
    this.over = false;
    this.busy = false;
    UI.updateAll();
    UI.hideModal();
    this.addLog(`⚔️ 战斗开始！${this.p1.name}（左） VS ${this.p2.name}（右）`, 'ult');
    if (mode === 'ai') {
      const aiChar = aiIsJiange ? this.p2 : this.p1;   // AI 控制的角色
      const playerChar = aiIsJiange ? this.p1 : this.p2;
      this.addLog(`🤖 ${aiChar.name} 由 AI 控制，你来操作 ${playerChar.name}`, 'info');
    } else {
      this.addLog('👥 本地双人：双方轮流操作', 'info');
    }
    this.addLog('提示：普攻耗 10 能量（命中 +12），行动回合开始 +25 能量，受击 +8 能量', 'info');
    audio.play('battle_start');
    this.beginTurn();
  },

  // 回合开始：结算持续伤害（灼烧 / 审计追缴）→ 检查眩晕 → 回复能量 / 交给 AI
  beginTurn() {
    const c = this.active;
    if (this.over) return;

    // 1. 回合开始结算持续伤害（DoT：灼烧 burn、审计追缴 bleed）
    const dots = [
      { key: 'burn',  icon: '🔥', label: '灼烧' },
      { key: 'bleed', icon: '🩸', label: '追缴' },
    ];
    for (const dot of dots) {
      const st = c.status[dot.key];
      if (st && st.turns > 0) {
        const dmg = st.dmg;
        st.turns--;
        if (st.turns <= 0) delete c.status[dot.key];
        this.addLog(`${dot.icon} ${c.name} 受到${dot.label}伤害 ${dmg} 点`, 'warn');
        this.applyDamage(null, c, dmg, { type: 'burn', isCrit: false });
        if (this.checkEnd()) return;
      }
    }

    // 2. 眩晕：跳过行动（不回复能量）
    if (c.status.stun && c.status.stun.turns > 0) {
      c.status.stun.turns--;
      if (c.status.stun.turns <= 0) delete c.status.stun;
      this.addLog(`💫 ${c.name} 处于眩晕状态，无法行动！`, 'warn');
      spawnFloat(window.innerWidth / 2, window.innerHeight * 0.3, '💫 眩晕', 'state');
      this.busy = true;
      setTimeout(() => { this.busy = false; this.endTurn(); }, 900);
      return;
    }

    // 3. 正常行动：自动回复能量 + 解锁操作
    c.energy = clamp(c.energy + 25, 0, c.energyMax);
    this.addLog(`—— ${c.name} 的行动回合（能量 +25）——`, 'info');
    UI.updateAll();

    if (c.isAI) {
      this.aiTurn();            // AI 托管
    } else {
      UI.enableActiveSkills();  // 解锁按钮
    }
  },

  // 使用技能（async：内部演出结束后切换回合）
  async useSkill(skillId) {
    if (this.over || this.busy) return;
    const c = this.active;
    const s = SKILLS[skillId];
    if (!s) return;
    if (c.energy < s.cost) {                       // 能量不足（按钮已禁用，双保险）
      audio.play('ui_click');
      return;
    }
    this.busy = true;
    UI.disableAllSkills();
    c.energy -= s.cost;
    // 进入冷却：+1 是因为释放当回合结束时冷却会立即 -1，
    // 这样才能保证释放后还有 s.cd 个整回合处于冷却（小技能隔1回合、大招隔2回合）
    if (s.cd) c.cd[skillId] = s.cd + 1;
    UI.updateAll();
    this.addLog(`${c.name} 释放【${s.name}】！`, s.kind === 'ult' ? 'ult' : (s.kind === 'skill' ? 'buff' : 'info'));
    audio.play('ui_click');

    await s.execute.call(this, c, this.foe);       // 执行技能（含演出与结算）

    if (this.checkEnd()) return;                   // 技能击杀时判定战斗结束
    this.endTurn();
  },

  // 回合结束：结算本方状态/冷却计时 → 切换行动方
  endTurn() {
    if (this.over) return;
    const c = this.active;
    // 本方状态持续时间 -1（defDown / weak）
    for (const k of ['defDown', 'weak']) {
      if (c.status[k]) {
        c.status[k].turns--;
        if (c.status[k].turns <= 0) delete c.status[k];
      }
    }
    // 技能冷却 -1
    for (const k of Object.keys(c.cd)) {
      c.cd[k]--;
      if (c.cd[k] <= 0) delete c.cd[k];
    }
    this.turnId = this.turnId === 'p1' ? 'p2' : 'p1';
    if (this.turnId === 'p1') this.round++;
    this.busy = false;
    UI.updateAll();
    this.beginTurn();
  },

  // ---- 伤害结算核心 ----
  // attacker 为 null 表示环境伤害（灼烧等）
  // opts: { type: 'physical'|'true'|'burn', isCrit, ignoreDefRatio }
  applyDamage(attacker, defender, raw, opts = {}) {
    let final = raw;
    // 攻击方被削弱（-20% 攻击）
    if (attacker && attacker.status.weak) {
      final = Math.round(final * (1 - attacker.status.weak.ratio));
    }
    // 物理伤害计算防御减伤；真实伤害/灼烧无视防御
    if (opts.type === 'physical') {
      const defNow = defender.def * (defender.status.defDown ? (1 - defender.status.defDown.ratio) : 1);
      const mit = defNow / (defNow + 100);                      // 防御减伤公式
      // ignoreDefRatio = 无视防御比例：只削减防御的减伤效果，不影响基础伤害
      const effectiveMit = mit * (1 - (opts.ignoreDefRatio || 0));
      final = Math.max(1, Math.round(final * (1 - effectiveMit)));
    }
    // 暴击
    if (opts.isCrit) final = Math.round(final * 1.8);
    // 护盾吸收
    let absorbed = 0;
    if (defender.shield > 0 && final > 0) {
      absorbed = Math.min(defender.shield, final);
      defender.shield -= absorbed;
      final -= absorbed;
      if (absorbed > 0) {
        floatAt(defender.slot, `🛡 -${absorbed}`, 'heal');
        this.addLog(`🛡 ${defender.name} 的护盾吸收了 ${absorbed} 点伤害`, 'buff');
      }
    }
    // 最终扣血
    defender.hp = clamp(defender.hp - final, 0, defender.hpMax);
    defender.dmgTaken += final;

    // ---- 受击演出 ----
    if (final > 0) {
      floatAt(defender.slot, `-${final}`, opts.isCrit ? 'crit' : (opts.type === 'true' ? 'true' : (opts.type === 'burn' ? 'burn' : 'dmg')));
      hitFlash(defender.slot);
      shakeStage();
      audio.play(defender.slot === 'p1' ? 'hit_p1' : 'hit_p2', 0.7);
      // 攻击方命中回复能量（普攻/技能命中都触发，鼓励进攻）
      if (attacker && final > 0) {
        attacker.energy = clamp(attacker.energy + 12, 0, attacker.energyMax);
      }
      // 受击回复少量能量
      if (attacker && defender.alive) {
        defender.energy = clamp(defender.energy + 8, 0, defender.energyMax);
      }
      // 血量告急心跳音效（每局每个角色只播一次）
      if (defender.alive && defender.hp / defender.hpMax < 0.3 && !defender.lowHpPlayed) {
        defender.lowHpPlayed = true;
        audio.play('low_hp', 0.8);
        this.addLog(`💓 ${defender.name} 血量告急！`, 'warn');
      }
    }
    return final;   // 返回实际造成伤害（供日志/护盾计算）
  },

  // 战斗结束判定
  checkEnd() {
    for (const c of [this.p1, this.p2]) if (c.hp <= 0) c.alive = false;
    if (!this.p1.alive || !this.p2.alive) {
      this.over = true;
      this.busy = false;
      const winner = this.p1.alive ? this.p1 : this.p2;
      const loser = this.p1.alive ? this.p2 : this.p1;
      this.addLog(`💀 ${loser.name} 被击败！${winner.name} 获胜！`, 'ult');
      UI.updateAll();
      showModal(winner, this.round);
      return true;
    }
    return false;
  },

  // 战斗日志
  addLog(text, cls = 'info') {
    const line = document.createElement('div');
    line.className = 'log-line ' + cls;
    line.textContent = `[R${this.round}] ${text}`;
    const body = $('log-body');
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;              // 自动滚动到底部
    while (body.children.length > 150) body.removeChild(body.firstChild); // 限制条数
  },

  // ---- AI 逻辑（按角色区分策略：检哥=控制流 / 宇哥=爆发流）----
  aiTurn() {
    const c = this.active;
    setTimeout(async () => {
      if (this.over || c !== this.active) return;   // 防止重开/切换后 AI 误操作
      const foe = this.foe;
      let skillId;
      if (c.dataId === 'jiange') {
        // 检哥 AI：控制、策略型（对手宇哥 1100 血，残血线约 35%）
        const canUlt = c.energy >= SKILLS.jiange_ult.cost && !c.cd.jiange_ult;   // 大招（需 110 能量）且不在冷却
        const canSkill = c.energy >= 30 && !c.cd.jiange_skill;    // 小技能且不在冷却
        if (canUlt && (Math.random() < 0.9 || foe.hp < 380)) {
          skillId = 'jiange_ult';                          // 能量满：优先大招（残血必放）
        } else if (canSkill && (Math.random() < 0.55 || foe.status.critBuff)) {
          skillId = 'jiange_skill';                        // 敌人蓄力则必打断；否则 55% 放控制（CD 已限制频率）
        } else {
          skillId = 'jiange_basic';                        // 否则稳定普攻
        }
      } else {
        // 宇哥 AI：高爆发、视觉系（对手检哥 1250 血，残血线约 33%）
        const canUlt = c.energy >= SKILLS.yuge_ult.cost && !c.cd.yuge_ult;   // 大招（需 100 能量）且不在冷却
        const canSkill = c.energy >= 30 && !c.cd.yuge_skill;
        if (canUlt && (Math.random() < 0.9 || foe.hp < 420)) {
          skillId = 'yuge_ult';                            // 能量满：大招（残血必放）
        } else if (canSkill && Math.random() < 0.5) {
          skillId = 'yuge_skill';                          // 50% 蓄力（下击必暴击+灼烧）
        } else {
          skillId = 'yuge_basic';                          // 否则平A
        }
      }
      this.addLog(`🤖 AI ${c.name}：释放【${SKILLS[skillId].name}】`, 'ai');
      await this.useSkill(skillId);
    }, 800);
  },
};

/* =====================================================================
 * 六、演出层
 * ===================================================================== */

// ---- 飘字（伤害数字 / 状态提示）----
function spawnFloat(x, y, text, cls) {
  const d = document.createElement('div');
  d.className = 'float-text ' + (cls || 'dmg');
  d.textContent = text;
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  $('float-layer').appendChild(d);
  d.addEventListener('animationend', () => d.remove());
}

// 在指定角色卡上方飘字
function floatAt(slot, text, cls) {
  const card = $('card-' + slot);
  const r = card.getBoundingClientRect();
  const x = r.left + r.width / 2 + (slot === 'p1' ? 46 : -46);
  const y = r.top + 34;
  spawnFloat(x, y, text, cls);
}

// 屏幕震动
function shakeStage() {
  const s = $('stage');
  s.classList.remove('shake');
  void s.offsetWidth;             // 强制重排以重启动画
  s.classList.add('shake');
}

// 受击闪白
function hitFlash(slot) {
  const card = $('card-' + slot);
  card.classList.remove('hit-flash');
  void card.offsetWidth;
  card.classList.add('hit-flash');
}

// 出手突进
function lungeChar(c) {
  const card = $('card-' + c.slot);
  card.classList.add(c.slot === 'p1' ? 'lunge-l' : 'lunge-r');
  setTimeout(() => card.classList.remove('lunge-l', 'lunge-r'), 460);
}

// 全屏瞬间闪光（检哥凝视用）
function flashScreen(color) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;inset:0;z-index:90;pointer-events:none;background:${color};opacity:0;animation:screen-flash 0.6s ease forwards;`;
  const style = document.createElement('style');
  style.textContent = '@keyframes screen-flash{0%{opacity:0}20%{opacity:1}100%{opacity:0}}';
  document.head.appendChild(style);
  document.body.appendChild(d);
  setTimeout(() => { d.remove(); style.remove(); }, 700);
}

/* ---------- 宇哥大招演出模式 ---------- */

// 播放大招演出素材，返回 Promise：
// 素材播放完毕（视频 ended / 图片演出结束 / 序列帧播完）后才 resolve，
// 调用方在 await 之后才结算伤害 —— 满足「素材播放完毕后再结算伤害」。
function playUltCutscene(title) {
  return new Promise((resolve) => {
    const overlay = $('ult-overlay');
    const img = $('ult-img');
    const video = $('ult-video');
    const titleEl = $('ult-title');

    titleEl.textContent = title || '宇 哥 降 临';
    overlay.classList.remove('ult-hidden');
    overlay.classList.remove('mode-image', 'mode-video');
    overlay.classList.remove('ult-fallback');   // 清除上一次的素材异常兜底状态
    video.pause();
    video.removeAttribute('src');   // 清空旧视频，避免缓存上一局
    // 双保险：默认隐藏 video（CSS 也按模式隐藏），仅视频模式才显示
    video.style.display = 'none';
    // 素材加载失败兜底：切换为渐变色底，避免黑屏（同时标题仍在，演出照常结束）
    img.onerror = () => overlay.classList.add('ult-fallback');

    let finished = false;
    let timeoutId = 0;               // 兜底超时（防止视频卡死导致演出无法结束）
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      if (ULT_ASSET.type === 'video') { video.onended = null; video.pause(); }
      overlay.classList.add('ult-hidden');
      resolve();                    // ★ 素材播放完毕，放行伤害结算 ★
    };

    // ---- 模式一：视频素材（<video> 标签，监听 ended）----
    if (ULT_ASSET.type === 'video') {
      overlay.classList.add('mode-video');
      video.muted = true;           // 静音视频，改用 atomic_bomb.mp3 配乐（可自行修改）
      video.style.display = '';     // 视频模式恢复显示
      video.src = ULT_ASSET.src;
      video.onended = finish;
      video.play().catch(() => { /* 播放失败走兜底超时 */ });
      timeoutId = setTimeout(finish, ULT_ASSET.videoFallbackTimeout); // 兜底，防止卡死
    }
    // ---- 模式二：图片序列帧（Canvas 风格逐帧切换）----
    else if (ULT_ASSET.type === 'frames' && ULT_ASSET.frames.length) {
      overlay.classList.add('mode-image');
      let i = 0;
      img.src = ULT_ASSET.frames[0];
      const timer = setInterval(() => {
        i = (i + 1) % ULT_ASSET.frames.length;
        img.src = ULT_ASSET.frames[i];
      }, ULT_ASSET.frameInterval);
      timeoutId = setTimeout(() => { clearInterval(timer); finish(); }, ULT_ASSET.duration);
    }
    // ---- 模式三（默认）：静态大图 ken-burns 演出 ----
    else {
      overlay.classList.add('mode-image');
      img.src = ULT_ASSET.src;      // TODO: 强制替换为宇哥大招专属素材路径@p.jpg
      timeoutId = setTimeout(finish, ULT_ASSET.duration);
    }

    // 大招音效（核爆）
    audio.play('yuge_ult');
  });
}

/* ---------- 检哥大招特效：Canvas 粒子「审计数据流」 ---------- */

const Fx = {
  canvas: null, ctx: null, raf: 0, particles: [],
  init() {
    this.canvas = $('fx-canvas');
    this.ctx = this.canvas.getContext('2d');
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
  },
  // 生成一次粒子爆发的 Promise（约 1.8 秒）
  burstAudit() {
    return new Promise((resolve) => {
      const canvas = this.canvas;
      canvas.classList.remove('fx-hidden');
      const W = canvas.width, H = canvas.height;
      const cx = W / 2, cy = H * 0.42;
      const colors = ['#22d3ee', '#a855f7', '#38bdf8', '#e0f2fe', '#7dd3fc'];
      // 粒子：碎片 + 圆点 + 审计数字
      this.particles = [];
      for (let i = 0; i < 130; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 7;
        this.particles.push({
          x: cx + (Math.random() - 0.5) * 60,
          y: cy + (Math.random() - 0.5) * 60,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd - 1.2,
          size: 2 + Math.random() * 6,
          color: colors[randInt(0, colors.length - 1)],
          life: 0, maxLife: 55 + Math.random() * 40,
          shape: Math.random() < 0.55 ? 'rect' : (Math.random() < 0.5 ? 'dot' : 'num'),
          num: String(randInt(0, 9)),
        });
      }
      // 大招巨字（带特殊样式，动画结束后自动移除）
      const big = document.createElement('div');
      big.className = 'float-text crit';
      big.textContent = '绝 对 检 阅';
      big.style.cssText += ';left:' + cx + 'px;top:' + cy + 'px;font-size:64px;letter-spacing:16px;color:#22d3ee;text-shadow:0 0 30px #22d3ee;';
      $('float-layer').appendChild(big);
      big.addEventListener('animationend', () => big.remove());

      let frames = 0;
      const draw = () => {
        frames++;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, W, H);
        // 半透明青色底光
        ctx.fillStyle = 'rgba(14,116,144,0.12)';
        ctx.fillRect(0, 0, W, H);
        for (const p of this.particles) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life++;
          if (p.life > p.maxLife) continue;
          const alpha = 1 - p.life / p.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 12;
          if (p.shape === 'rect') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.life * 0.2);
            ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
            ctx.restore();
          } else if (p.shape === 'num') {
            ctx.font = `bold ${p.size * 2}px Consolas, monospace`;
            ctx.fillText(p.num, p.x, p.y);
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        if (frames < 110) {
          // 用 setTimeout 驱动（而非 rAF），保证在后台标签页/无头环境下也能正常推进
          this._timer = setTimeout(draw, 16);
        } else {
          ctx.clearRect(0, 0, W, H);
          canvas.classList.add('fx-hidden');
          resolve();               // 粒子演出结束
        }
      };
      draw();
    });
  },
};

/* =====================================================================
 * 七、UI 渲染
 * ===================================================================== */

const UI = {
  // 渲染单个角色卡
  renderChar(slot, c) {
    const card = $('card-' + slot);
    $('avatar-' + slot).src = c.avatar;
    $('name-' + slot).textContent = c.name;
    $('role-' + slot).textContent = c.role + (c.isAI ? '（AI）' : '');

    // HP 条
    const hpPct = (c.hp / c.hpMax) * 100;
    const hpFill = $('hp-fill-' + slot);
    hpFill.style.width = hpPct + '%';
    hpFill.classList.toggle('low', c.hp / c.hpMax < 0.3);
    $('hp-text-' + slot).textContent = `${c.hp}/${c.hpMax}`;

    // 能量条
    const enPct = (c.energy / c.energyMax) * 100;
    const enFill = $('en-fill-' + slot);
    enFill.style.width = enPct + '%';
    enFill.classList.toggle('full', c.energy >= c.energyMax);
    $('en-text-' + slot).textContent = `${c.energy}/${c.energyMax}`;

    // 状态图标
    const chips = [];
    if (c.status.burn) chips.push(`<span class="status-chip burn">🔥灼烧 ${c.status.burn.turns}</span>`);
    if (c.status.bleed) chips.push(`<span class="status-chip bleed">🩸追缴 ${c.status.bleed.turns}</span>`);
    if (c.status.stun) chips.push(`<span class="status-chip stun">💫眩晕 ${c.status.stun.turns}</span>`);
    if (c.status.defDown) chips.push(`<span class="status-chip defdown">🛡↓防御 ${c.status.defDown.turns}</span>`);
    if (c.status.weak) chips.push(`<span class="status-chip weak">💤虚弱 ${c.status.weak.turns}</span>`);
    if (c.status.critBuff) chips.push(`<span class="status-chip buff">⚡必暴击</span>`);
    if (c.shield > 0) chips.push(`<span class="status-chip shield">🛡护盾 ${c.shield}</span>`);
    $('status-' + slot).innerHTML = chips.join('');

    // 行动中高亮
    card.classList.toggle('active-card', Battle.turnId === slot && !Battle.over);
  },

  // 技能按钮状态刷新
  updateSkills() {
    for (const slot of ['p1', 'p2']) {
      const c = Battle.charBySlot(slot);
      const panel = $('panel-' + slot);
      panel.querySelectorAll('.skill-btn').forEach((btn) => {
        const s = SKILLS[btn.dataset.skill];
        const myTurn = Battle.turnId === slot && !Battle.over;
        const canAfford = c.energy >= s.cost;
        const cdLeft = s.cd ? (c.cd[btn.dataset.skill] || 0) : 0;   // 剩余冷却回合
        // 玩家可操作条件：未结束、未在演出中、轮到该角色、非 AI 托管、能量足够、不在冷却
        const enabled = !Battle.over && !Battle.busy && myTurn && !c.isAI && canAfford && cdLeft <= 0;
        btn.disabled = !enabled;
        btn.classList.toggle('ready', myTurn && canAfford && !c.isAI && cdLeft <= 0);
        // 冷却角标：CD 中显示红色角标，并提示剩余回合
        btn.classList.toggle('on-cd', cdLeft > 0);
        if (cdLeft > 0) {
          btn.dataset.cd = cdLeft;
          btn.title = `冷却中（剩 ${cdLeft} 回合）`;
        } else {
          delete btn.dataset.cd;
          btn.title = '';
        }
      });
    }
  },

  enableActiveSkills() { this.updateSkills(); },
  disableAllSkills() {
    document.querySelectorAll('.skill-btn').forEach((b) => { b.disabled = true; });
  },

  // 回合横幅
  renderTurnInfo() {
    const banner = $('turn-banner');
    if (Battle.over) {
      banner.textContent = '战斗结束';
      banner.className = 'turn-banner';
    } else {
      const c = Battle.active;
      banner.textContent = `第 ${Battle.round} 回合 · ${c.name}行动${c.isAI ? '（AI）' : ''}`;
      banner.className = 'turn-banner live' + (c.slot === 'p1' ? ' gold' : '');
    }
    $('round-badge').textContent = `回合 ${Battle.round} · ${Battle.p1.name} ${Battle.p1.hp} / ${Battle.p2.name} ${Battle.p2.hp}`;
  },

  updateAll() {
    this.renderChar('p1', Battle.p1);
    this.renderChar('p2', Battle.p2);
    this.updateSkills();
    this.renderTurnInfo();
  },

  showModal(winner, rounds) {
    const box = $('modal-box');
    const win = winner.slot === 'p1';
    box.className = 'modal-box ' + (win ? 'win' : 'lose');
    if (Battle.mode === 'ai') {
      $('modal-title').textContent = win ? '胜 利' : '失 败';
      $('modal-sub').textContent = win
        ? `宇哥战胜了检哥！共 ${rounds} 回合，宇哥剩余 ${winner.hp} HP`
        : `检哥（AI）获胜！共 ${rounds} 回合，你的宇哥倒下了…`;
    } else {
      $('modal-title').textContent = winner.name + ' 获胜！';
      $('modal-sub').textContent = `共 ${rounds} 回合，${winner.name} 剩余 ${winner.hp} HP`;
    }
    $('modal').classList.remove('modal-hidden');
  },
  hideModal() {
    $('modal').classList.add('modal-hidden');
  },
};

/* =====================================================================
 * 八、全局：胜利弹窗（独立函数，供 Battle 调用）
 * ===================================================================== */

function showModal(winner, rounds) { UI.showModal(winner, rounds); }

/* =====================================================================
 * 九、初始化与事件绑定
 * ===================================================================== */

function bindEvents() {
  // 技能按钮
  document.querySelectorAll('.skill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = Battle.active;
      if (c && !c.isAI) Battle.useSkill(btn.dataset.skill);
    });
  });

  // 键盘快捷键 1 / 2 / 3
  document.addEventListener('keydown', (e) => {
    const idx = ['1', '2', '3'].indexOf(e.key);
    if (idx < 0) return;
    const c = Battle.active;
    if (!c || c.isAI || Battle.over || Battle.busy) return;
    const btns = $('panel-' + c.slot).querySelectorAll('.skill-btn');
    if (btns[idx] && !btns[idx].disabled) {
      audio.play('ui_click');
      Battle.useSkill(btns[idx].dataset.skill);
    }
  });

  // 音效开关
  $('btn-mute').addEventListener('click', () => {
    audio.muted = !audio.muted;
    $('btn-mute').textContent = audio.muted ? '🔇 静音' : '🔊 音效';
    audio.play('ui_click');
  });

  // 首次启动声明：初次进入（含手机端首次打开 App）强制弹出，确认后不再打扰
  if (!localStorage.getItem('yuge_jiange_disclaimer')) {
    $('disclaimer').classList.remove('modal-hidden');
  }
  $('btn-disclaimer-ok').addEventListener('click', () => {
    localStorage.setItem('yuge_jiange_disclaimer', '1');
    $('disclaimer').classList.add('modal-hidden');
    audio.play('ui_click');
  });

  // 关于界面
  $('btn-about').addEventListener('click', () => {
    $('about-modal').classList.remove('modal-hidden');
    audio.play('ui_click');
  });
  $('btn-about-close').addEventListener('click', () => {
    $('about-modal').classList.add('modal-hidden');
  });

  // 读取当前设置（模式 + AI 控制方）
  const getSettings = () => ({
    mode: $('mode-select').value,
    aiSide: $('ai-side-select').value,
  });

  // 模式变化：双人模式下禁用「AI 控制方」选择器
  const syncAiSideUI = () => {
    const isAi = $('mode-select').value === 'ai';
    $('ai-side-select').disabled = !isAi;
  };

  // 重新开始（顶部 / 弹窗）
  const restart = () => {
    audio.play('battle_start');
    const s = getSettings();
    Battle.start(s.mode, s.aiSide);
  };
  $('btn-restart').addEventListener('click', restart);
  $('btn-restart-modal').addEventListener('click', restart);

  // 模式切换（立即生效于下一局）
  $('mode-select').addEventListener('change', () => {
    Battle.mode = $('mode-select').value;
    syncAiSideUI();
  });

  // 开场界面
  $('btn-start').addEventListener('click', () => {
    $('start-screen').style.display = 'none';
    // 把开场界面的选择同步到顶栏
    $('mode-select').value = $('start-mode').value;
    $('ai-side-select').value = $('start-ai-side').value;
    syncAiSideUI();
    const s = getSettings();
    Battle.start(s.mode, s.aiSide);   // 点击=用户手势，解锁音频
  });

  // 开场界面：选双人时禁用 AI 控制方选择器
  const syncStartAiUI = () => {
    $('start-ai-side').disabled = $('start-mode').value !== 'ai';
  };
  $('start-mode').addEventListener('change', syncStartAiUI);
  syncAiSideUI();
  syncStartAiUI();
}

// 页面加载完成后的初始化
function init() {
  // 预填头像（防止首次渲染闪烁）
  $('avatar-p1').src = AVATARS.yuge;
  $('avatar-p2').src = AVATARS.jiange;
  Fx.init();
  bindEvents();
  UI.disableAllSkills();
}

window.addEventListener('DOMContentLoaded', init);
