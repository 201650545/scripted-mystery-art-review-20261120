import * as THREE from '../舞台原型/node_modules/three/build/three.module.js'
import { createStageViews } from './stage-views.js?v=20261120-night-western-flow8'
import { buildPuppet } from './puppet-model.js?v=20261120'

const names = ['沈知夏', '周启明', '林素琴', '许承安', '何映秋']
const images = ['角色01_木偶版_1K.png', '角色02_周启明_木偶版_2K.png', '角色03_林素琴_木偶版_2K.png', '角色04_许承安_木偶版_2K.png', '角色05_何映秋_木偶版_2K.png']
const phases = [
  ['create', '布置这一场故事', '选择主持方式，准备五人的围桌。', 0],
  ['join', '等候入席', '五个座位，等待各自的故事。', 0],
  ['ready', '读一读你的故事', '角色卡在各自手机中阅读。', 0],
  ['consent', '开场之前', '每个人都可以决定是否同意录音。', 0],
  ['intro', '初次见面', '按举手顺序介绍自己，听一听彼此的故事。', 1],
  ['ask', '你想问谁', '线索开放之前，先聊聊刚才的介绍。', 2],
  ['clue1', '第一封线索', '公共线索与个人线索同时开放。', 3],
  ['discuss1', '话语之间', '第一轮讨论与提问。', 3],
  ['clue2', '另一面故事', '第二轮线索已经开放。', 4],
  ['discuss2', '最后的疑问', '第二轮讨论与提问。', 4],
  ['vote', '把答案留在心里', '每个人秘密提交选择，结束后统一公开。', 5],
  ['tally', '此刻，揭开选择', '本轮投票已经结束。', 5],
  ['tie', '再听一听彼此', '重新讨论后，向全部五名玩家复投。', 5],
  ['exit', '一席落幕', '机关轻响，木偶缓缓退入幕后。', 6],
  ['silence', '静候真相', '让这一刻，安静两秒。', 6],
  ['identity', '面具之后', '身份揭晓。', 6],
  ['truth', '故事的全貌', '案件真相揭晓。', 6],
  ['outcome', '这一场的答案', '本局结果已经确定。', 6],
  ['ended', '散场，再会', '故事落幕，留下一桌回忆。', 7],
]
const scripts = [{
  id: 'rainy-old-studio',
  title: '雨夜旧馆',
  players: 5,
  description: '暴雨封路，五名故人受邀回到即将拆除的旧照相馆。晚宴前，邀请人死在暗房里。一张尚未冲洗完成的底片，将众人重新牵回十年前的一次失踪案。',
  duration: '两轮线索 · 时长待试玩确认',
  notice: '先调查今晚的死亡，再循着底片还原十年前的失踪。每个人都掌握一段往事，也隐瞒了一件事。',
  status: '原创剧本筹备中 · 当前可体验联机流程，角色故事、案件线索与结局待编写。',
  roles: names,
}]
let scriptDetail = null
let creatingRoom = false
let pendingShare = null

const journeyNames = ['入席与准备', '自我介绍', '初始提问', '第一轮线索与讨论', '第二轮线索与讨论', '秘密投票', '落幕与真相', '本局结束']
const byId = Object.fromEntries(phases.map(phase => [phase[0], phase]))
let state
let player = 0
let tab = 'stage'
let toastTimeout
let sceneView
let endpoint = new URLSearchParams(location.search).get('endpoint') || 'computer'
if (!['computer', 'host', 'player', 'test'].includes(endpoint)) endpoint = 'computer'
let playerSceneOpen = false
let stagePanel = null
const networked = new URLSearchParams(location.search).get('demo') !== '1'
const testDevice = new URLSearchParams(location.search).get('testDevice')
let entryMode = 'home'
let accordionPanel = 'story'
let roomCodeDraft = ''
let invitationQrOpen = false
let musicLibrary = []
let musicLibraryStatus = 'loading'
let musicLibraryError = ''
let musicEnabled = false
let musicTrackIndex = 0
let preparationLoop = true
let musicLibraryRequest
const musicAudio = new Audio()
musicAudio.preload = 'none'
const preparationTrackTitles = ['O Come O Come Emmanuel', 'the grotto', 'old doll']
function preparationTracks() {
  return preparationTrackTitles.map(title => musicLibrary.find(track => track.title === title)).filter(Boolean)
}
musicAudio.addEventListener('ended', () => {
  if (!musicEnabled) return
  if (!preparationLoop) {
    musicEnabled = false
    renderMusicControls()
    return
  }
  const preparation = preparationTracks()
  if (!preparation.length) return
  const next = preparation[(preparation.findIndex(track => track.title === musicLibrary[musicTrackIndex]?.title) + 1) % preparation.length]
  musicTrackIndex = musicLibrary.indexOf(next)
  playMusicTrack(next)
})
async function loadMusicLibrary() {
  musicLibraryStatus = 'loading'
  musicLibraryError = ''
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch('/主体原型/music-library.json?v=20261120', { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`曲库加载失败（${response.status}）`)
    const items = await response.json()
    if (!Array.isArray(items) || items.length === 0) throw new Error('曲库没有可播放的曲目。')
    musicLibrary = items
    musicLibraryStatus = 'ready'
    const firstPreparationTrack = preparationTracks()[0]
    if (firstPreparationTrack) musicTrackIndex = musicLibrary.indexOf(firstPreparationTrack)
  } catch (error) {
    musicLibraryStatus = 'failed'
    musicLibraryError = error.name === 'AbortError' ? '曲库请求超时。' : error.message
  } finally {
    clearTimeout(timeout)
  }
}
musicLibraryRequest = loadMusicLibrary()
function apiUrl(path) {
  const url = new URL(path, location.origin)
  if (testDevice) url.searchParams.set('testDevice', testDevice)
  return url.pathname + url.search
}

function playMusicTrack(track) {
  if (!track) return
  musicAudio.src = apiUrl(`/api/music/${encodeURIComponent(track.file)}`)
  musicAudio.playbackRate = Number(state?.musicRate || 0.9)
  musicAudio.play().then(() => {
    musicEnabled = true
    renderMusicControls()
  }).catch(() => {
    musicEnabled = false
    renderMusicControls()
    notify('浏览器没有允许播放，请再点一次音乐按钮。')
  })
}

function renderMusicControls() {
  document.querySelectorAll('[data-action="music-toggle"]').forEach(button => {
    button.setAttribute('aria-pressed', String(musicEnabled))
    button.setAttribute('aria-label', musicEnabled ? '停止音乐' : '播放音乐')
    button.title = musicEnabled ? '停止音乐' : '播放音乐'
    button.textContent = musicEnabled ? 'Ⅱ' : '♫'
  })
  const rate = Number(state?.musicRate || 0.9)
  musicAudio.playbackRate = rate
  document.querySelectorAll('.music-rate-select').forEach(select => { select.value = String(rate) })
}

async function toggleMusic() {
  if (musicEnabled) {
    musicAudio.pause()
    musicEnabled = false
    renderMusicControls()
    return
  }
  if (musicLibraryStatus !== 'ready') {
    if (musicLibraryStatus === 'failed') musicLibraryRequest = loadMusicLibrary()
    await musicLibraryRequest
    if (musicLibraryStatus !== 'ready') return notify(`${musicLibraryError || '曲库加载失败。'}请检查局域网服务后重试。`)
  }
  preparationLoop = true
  const selected = preparationTracks()[0]
  if (!selected) return notify('准备阶段曲目缺失，请打开曲库选择音乐。')
  musicTrackIndex = musicLibrary.indexOf(selected)
  playMusicTrack(selected)
}

async function showMusicLibrary() {
  if (musicLibraryStatus !== 'ready') {
    if (musicLibraryStatus === 'failed') musicLibraryRequest = loadMusicLibrary()
    await musicLibraryRequest
    if (musicLibraryStatus !== 'ready') return notify(`${musicLibraryError || '曲库加载失败。'}请检查局域网服务后重试。`)
  }
  const groups = ['A 静水', 'B 暗涌', 'C 怪诞', 'D 压迫', 'E 伤感', 'F 怀旧']
  document.querySelector('#music-library-content').innerHTML = groups.map(group => {
    const tracks = musicLibrary.map((track, index) => ({ ...track, index })).filter(track => track.group === group)
    if (!tracks.length) return ''
    return `<section class="music-group"><h3>${group}</h3>${tracks.map(track => `<button class="music-track" data-music-index="${track.index}"><span>${escaped(track.title)}</span><small>${escaped(track.durationLabel)} · ${escaped(track.emotion)}</small></button>`).join('')}</section>`
  }).join('')
  document.querySelector('#music-library-dialog').showModal()
}

let lan = { me: null, revision: -1, connected: false }
let lanEvents
function hasJoined() { return networked ? lan.me !== null : state.joined[player] }

function freshState() {
  return {
    musicRate: 0.9,
    scriptId: null, roomCode: null, roomOwner: null, seats: Array(5).fill(null), joined: Array(5).fill(false), seenShared: Array.from({ length: 5 }, () => []),
    phase: 'create', host: 'ai', manualControl: false, phaseSeconds: 0, roles: Array(5).fill(null), ready: Array(5).fill(false),
    consent: Array(5).fill(null), recorded: false,
    introduced: Array(5).fill(false), introQueueStarted: false, askQueue: [], queue: [], speaker: null, target: null,
    read: { 1: Array.from({ length: 5 }, () => [false, false]), 2: Array.from({ length: 5 }, () => [false, false]) },
    shared: [], confirmed: Array(5).fill(false), remaining: null, paused: false,
    votes: Array(5).fill(undefined), selectedVote: null, voteRound: 1, history: [], winner: null,
    summaries: {}, versions: [], messages: [], events: [], disconnected: Array(5).fill(false),
    hostDisconnected: false, keptRecording: true,
  }
}

function roleName(index) {
  return names[state.roles[index] ?? index]
}

function escaped(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function action(label, name, argument = '', primary = false, disabled = false) {
  return `<button data-action="${name}" data-value="${argument}" class="${primary ? 'primary' : ''}" ${disabled ? 'disabled' : ''}>${label}</button>`
}

function notify(message) {
  const toast = document.querySelector('#toast')
  toast.textContent = message
  toast.hidden = false
  clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toast.hidden = true }, 3200)
}

function record(message) {
  state.events.push(message)
}

function isDiscussion() {
  return ['ask', 'discuss1', 'discuss2', 'tie'].includes(state.phase)
}

function roundNumber() {
  return ['clue2', 'discuss2', 'vote', 'tally', 'tie', 'exit', 'silence', 'identity', 'truth', 'outcome', 'ended'].includes(state.phase) ? 2 : 1
}

function go(phase) {
  state.phase = phase
  state.phaseSeconds = 0
  state.queue = phase === 'ask' ? [...(state.askQueue || [])] : []
  state.askQueue = []
  state.introQueueStarted = false
  state.speaker = null
  state.target = null
  if (phase === 'ask') state.speaker = state.queue.shift() ?? null
  state.confirmed.fill(false)
  state.remaining = null
  state.paused = false
  tab = 'stage'
  if (isDiscussion()) state.remaining = 60
  if (phase === 'vote') {
    state.votes = Array(5).fill(undefined)
    state.remaining = 180
    state.selectedVote = null
  }
  if (phase === 'silence') state.remaining = 2
  record(`进入${byId[phase][1]}`)
  render()
}

function finishDiscussion() {
  const phase = state.phase
  if (phase === 'discuss1' || phase === 'discuss2') {
    const round = phase === 'discuss1' ? 1 : 2
    state.summaries[round] = ''
    record(`第${round}轮总结等待手工补记，AI 服务未接入`)
  }
  go(({ ask: 'clue1', discuss1: 'clue2', discuss2: 'vote', tie: 'vote' })[phase])
}

function finishVote() {
  state.votes = state.votes.map(value => value === undefined ? null : value)
  const counts = Array(5).fill(0)
  state.votes.forEach(value => { if (value !== null) counts[value]++ })
  const highest = Math.max(...counts)
  const leaders = counts.flatMap((count, index) => count === highest ? [index] : [])
  state.winner = highest > 0 && leaders.length === 1 ? leaders[0] : null
  state.history.push({ round: state.voteRound, votes: [...state.votes], counts })
  go('tally')
}

function queuePlayer(index) {
  if (state.queue.includes(index) || state.speaker === index) return notify('你已经在发言或排队。')
  if (state.phase === 'intro' && state.introduced[index]) return notify('这一席已完成介绍。')
  if (state.phase === 'intro' && !state.introQueueStarted) {
    state.queue.push(index)
    if (state.queue.length === 5) {
      state.introQueueStarted = true
      state.speaker = state.queue.shift()
      record('五名玩家均已举手，开始按队列介绍。')
    }
  } else if (state.speaker === null) state.speaker = index
  else state.queue.push(index)
  state.remaining = null
  state.confirmed.fill(false)
  record(`${roleName(index)}举手`)
}

function queueAsk(index) {
  if (state.askQueue.includes(index) || state.speaker === index) return notify('你已经在提问队列中。')
  state.askQueue.push(index)
  record(`${roleName(index)}在介绍阶段排队提问`)
}

function nextSpeaker() {
  if (state.speaker !== null && state.phase === 'intro') state.introduced[state.speaker] = true
  state.speaker = state.queue.shift() ?? null
  state.target = null
  if (state.speaker === null && isDiscussion()) state.remaining = 60
}

const privateNotesKey = () => `weizhuo-notes:${state.roomCode || 'demo'}:${player}`
function readPrivateNotes() {
  try { return { text: '', favorites: [], mode: 'phone', ...JSON.parse(localStorage.getItem(privateNotesKey()) || '{}') } }
  catch { return { text: '', favorites: [], mode: 'phone' } }
}
function roleCard() {
  const role = state.roles[player]
  if (role === null) return '<h3>选一个座位</h3><p>加入房间后，先领取自己的角色。</p>'
  const notes = readPrivateNotes()
  const saved = notes.favorites.includes('timeline-placeholder')
  return `<div class="portrait"><img src="../图库素材/${images[role]}" alt="${names[role]}的角色设定"></div><h3>${names[role]}</h3><p class="muted">角色故事仍待编写。时间轴结构先按正式阅读体验预留。</p><section class="story-timeline role-timeline"><article><mark>关键时间 · 待填</mark><h4>事件标题待填</h4><p>正式角色故事提供后，按时间顺序整理事件，并突出重要时间与信息。</p></article><article><mark>人物关系 · 待填</mark><h4>关系变化待填</h4><p>当前为空白内容位，不代表剧本事实。</p></article></section><h4>重点收藏</h4><p class="muted">正文交付后，点按或长按标红重点即可收藏。</p><button data-action="favorite-toggle" data-value="timeline-placeholder" class="story-highlight ${saved ? 'saved' : ''}">${saved ? '已收藏' : '收藏重点示意'} · 正文待填</button><h4>个人笔记</h4><div class="actions"><button data-action="note-mode" data-value="phone" class="${notes.mode === 'phone' ? 'selected' : ''}">手机记录</button><button data-action="note-mode" data-value="paper" class="${notes.mode === 'paper' ? 'selected' : ''}">纸笔记录</button></div>${notes.mode === 'phone' ? `<textarea id="private-notes" maxlength="3000" placeholder="写下自己的观察……">${escaped(notes.text)}</textarea><button data-action="save-private-notes">保存笔记</button>` : '<p class="muted">已选择纸笔记录，可在纸上整理观察。</p>'}<p class="muted">这份内容只在本人手机出现。</p>`
}

function renderJourney() {
  const group = byId[state.phase][3]
  document.querySelector('#journey').innerHTML = journeyNames.map((name, index) => `<div class="journey-item ${index === group ? 'active' : ''} ${index < group ? 'done' : ''}"><i></i><span>${name}</span></div>`).join('')
}

function timeText() {
  if (state.remaining === null) return ''
  return `${Math.floor(state.remaining / 60).toString().padStart(2, '0')}:${(state.remaining % 60).toString().padStart(2, '0')}`
}

function renderStage() {
  document.querySelector('#stage-title').textContent = byId[state.phase][1]
  let status = '五人围桌'
  if (['create', 'join', 'ready', 'consent'].includes(state.phase)) status = ['join', 'ready'].includes(state.phase) ? `房间码 ${state.roomCode || '待创建'} · ${state.joined.filter(Boolean).length}/5` : `${state.roles.filter(value => value !== null).length} / 5 已入席`
  if (state.speaker !== null) status = `当前发言 · ${roleName(state.speaker)}`
  if (state.phase === 'vote') status = `${state.votes.filter(value => value !== undefined).length} / 5 已投 · ${timeText()}`
  if (isDiscussion() && state.speaker === null) status = state.remaining === 0 ? '等待全员确认' : `讨论收尾 · ${timeText()}`
  if (state.phase === 'silence') status = `${state.remaining} 秒`
  if (state.paused || state.hostDisconnected) status = state.hostDisconnected ? '主持设备离线 · 已暂停' : '主持问答 · 已暂停'
  const statusElement = document.querySelector('#stage-state')
  statusElement.textContent = status
  statusElement.classList.toggle('paused', state.paused || state.hostDisconnected)
  document.querySelector('#director-label').textContent = state.host === 'ai' ? 'AI 幕后主持 · 演示' : '真人主持'
  document.querySelector('#stage-caption').textContent = directorPrompt()
  const overlay = document.querySelector('#public-overlay')
  overlay.hidden = !['tally', 'identity', 'truth', 'outcome', 'ended'].includes(state.phase)
  if (state.phase === 'tally') {
    const result = state.history.at(-1)
    overlay.innerHTML = `<h2>第 ${result.round} 轮票型</h2>${names.map((_, index) => `<div class="receipt"><span>${roleName(index)}</span><span>${result.votes[index] === null ? '弃票' : `投给 ${names[result.votes[index]]}`}</span></div>`).join('')}<p>${names.map((name, index) => `${name} ${result.counts[index]} 票`).join(' · ')}</p><p>${state.winner === null ? '本轮未产生唯一最高票，重新讨论后复投。' : `${names[state.winner]}成为唯一出局者。`}</p>`
  }
  if (state.phase === 'identity') overlay.innerHTML = `<h2>测试身份揭晓</h2><p>本次出局角色</p><div class="result-title">${names[state.winner]}</div><p>测试凶手为${names[4]}。这项设定仅用于验证胜负流程。</p>`
  if (state.phase === 'truth') overlay.innerHTML = '<h2>案件真相</h2><p>这里将呈现完整案件的时间线、作案过程与线索解释。</p><p>当前为空白测试局，正式案件内容等待填入。</p>'
  if (state.phase === 'outcome') overlay.innerHTML = `<h2>本局结果</h2><div class="result-title">${state.winner === 4 ? '其他玩家获胜' : '凶手获胜'}</div><p>依据本次票出的角色与测试凶手身份自动判断。</p>`
  if (state.phase === 'ended') overlay.innerHTML = `<h2>散场，再会。</h2><p>这一局已完成全部流程。</p><p>${state.recorded ? '原型未生成真实录音文件。' : '本局未录音。'}</p>`
  sceneView?.update()
}

function directorPrompt() {
  if (state.hostDisconnected) return '主持设备已断线，流程暂停，等待原设备重连。'
  if (state.paused) return '当前流程已暂停。查看主持解释后，请确认继续。'
  const prompts = {
    create: '先选择这一场故事的主持方式。',
    join: '请各位选择角色入席。',
    ready: '请阅读自己的角色卡，读完后确认准备好。',
    consent: '请各位回应录音意愿，任何一人不同意则关闭录音与识别。',
    intro: '请举手介绍自己，说完后点击下一位。',
    ask: '你可以针对刚才的介绍提问，举手后按顺序发言。',
    clue1: '第一轮线索已开放，请分别确认公共线索与个人线索已读。',
    discuss1: '现在开始第一轮讨论。需要发言时请举手。',
    clue2: '第二轮线索已开放，请阅读新信息并确认已读。',
    discuss2: '请完成最后一轮讨论，再秘密提交你的判断。',
    vote: '请在手机上秘密投票或弃票，结束后统一公开。',
    tally: state.winner === null ? '本轮需要重新讨论后复投。' : '票型已经公开，即将开始退场。',
    tie: '请再次讨论。下一轮仍可投给全部未出局玩家。',
    exit: '请看向舞台，出局木偶正在退场。',
    silence: '请安静片刻。',
    identity: '现在揭晓测试身份。',
    truth: '这里将呈现正式案件的完整真相。',
    outcome: '本局胜负已经确定。',
    ended: '本局结束，可以回看已公开内容与阶段总结。',
  }
  return prompts[state.phase]
}

function selectedScript() {
  return scripts.find(script => script.id === state.scriptId) || scripts[0]
}

function scriptCover(script, compact = false) {
  return `<div class="script-cover-slot${compact ? ' compact' : ''}" role="img" aria-label="${escaped(script.title)}封面预留"><span>封面预留</span><strong>${escaped(script.title)}</strong></div>`
}

function storySections() {
  return [
    ['story', '剧本简介', `<div class="story-timeline"><article><mark>十年前</mark><h4>一桩失踪旧案</h4><p>一段被隐瞒的往事，将五名故人的命运联系在一起。</p></article><article><mark>今夜 · 暴雨</mark><h4>回到旧照相馆</h4><p>五人受邀来到即将拆除的照相馆，暴雨封住了离开的路。</p></article><article><mark>晚宴前</mark><h4>暗房里的死者</h4><p>邀请人死在暗房里，一张尚未冲洗完成的底片，重新牵出十年前的失踪案。</p></article></div><p class="muted">原创剧本筹备中，以上为公开背景，案件正文与证据链待编写。</p>`],
    ['characters', '角色简介', `<div class="character-intros">${names.map((name,index)=>`<article><img src="../图库素材/${images[index]}" alt="${name}"><div><h4>${name}</h4><p>五名受邀故人之一，详细人物背景待编写。</p></div></article>`).join('')}</div>`],
    ['guide', '玩法与准备', '<h4>五人围桌 · 两轮线索</h4><ol><li>加入房间后，各自选择角色和空座。</li><li>阅读角色卡，五人准备完毕后开始。</li><li>自我介绍、初始提问、两轮线索与讨论。</li><li>秘密投票，公开票型并揭晓真相。</li></ol><p><mark>电脑主机持续运行</mark>，所有设备保持连接同一局域网。</p>'],
  ]
}
function accordion(sections) {
  const active = sections.some(section => section[0] === accordionPanel) ? accordionPanel : sections[0][0]
  const activeSection = sections.find(section => section[0] === active)
  const [activeId, activeTitle, activeContent] = activeSection
  return `<div class="info-accordion"><nav class="accordion-index" aria-label="内容分区">${sections.map(([id,title])=>`<button class="accordion-heading ${id===active?'active':''}" data-action="accordion" data-value="${id}" aria-expanded="${id===active}"><span>${title}</span><span aria-hidden="true">${id===active?'−':'＋'}</span></button>`).join('')}</nav><section class="accordion-panel" aria-label="${activeTitle}"><div class="accordion-content" tabindex="0" aria-label="${activeTitle}内容" data-section="${activeId}">${activeContent}</div></section></div>`
}
function libraryHero(script) {
  return `<header class="library-hero">${scriptCover(script)}<div class="library-caption"><h3>${escaped(script.title)}</h3><p>5 人 · 原创悬疑 · 两轮线索</p></div></header>`
}
function roomEntry() {
  const script = scripts[0]
  if (entryMode === 'join') return `<div class="fixed-player-page">${libraryHero(script)}<div class="entry-form-content"><h3>填写房主房间码</h3><p>向房主获取六位数字，提交后进入房间。</p>${joinRoomForm()}</div><footer class="fixed-actions">${action('返回入口','entry-home')}</footer></div>`
  if (entryMode === 'library') return renderLibrary()
  return `<div class="fixed-player-page">${libraryHero(script)}${accordion([storySections()[0]])}<footer class="fixed-actions entry-options">${action('自己创建房间','entry-create','',true,state.phase!=='create')}${action('填写房主房间码','entry-join')}</footer></div>`
}
function renderLibrary() {
  const script = scripts.find(item=>item.id===scriptDetail) || scripts[0]
  let sections = storySections()
  if (creatingRoom) sections = [['hosting','选择主持方式',`<div class="actions">${action('AI 主持','host','ai',state.host==='ai')}${action('真人主持','host','human',state.host==='human')}</div><p>${state.host==='ai'?'当前采用预设流程演示，真实 AI 待接入。':'真人主持使用独立设备，独立于五名玩家。'}</p><p>本次仍使用流程测试内容。</p>`], ...sections]
  const mainAction = creatingRoom ? action('创建房间并入席','create',script.id,true,state.phase!=='create') : scriptDetail ? action('下一步 · 选择主持','begin-create',script.id,true,state.phase!=='create') : action('查看剧本详情','script-detail',script.id,true)
  return `<div class="fixed-player-page">${libraryHero(script)}${accordion(sections)}<footer class="fixed-actions">${action(creatingRoom?'返回详情':'返回入口',creatingRoom?'cancel-create':'entry-home')}${mainAction}</footer></div>`
}
function joinRoomForm() {
  return `<form id="join-room-form"><label for="room-code">六位房间码</label><input id="room-code" inputmode="numeric" autocomplete="off" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="请输入房主提供的房间码" value="${escaped(roomCodeDraft)}" required><button type="submit" class="primary">确认加入房间</button><p id="join-error" role="status"></p></form>`
}

function seatList(interactive = false) {
  return `<div class="seat-list">${names.map((_, seat) => {
    const occupant = state.seats.indexOf(seat)
    const occupied = occupant !== -1
    const label = `${seat + 1} 号座位 · ${occupied ? roleName(occupant) : '空位'}`
    return interactive ? action(label + (occupant === player ? '（我）' : ''), 'pick-seat', seat, occupant === player, occupied || state.roles[player] === null || !['join', 'ready'].includes(state.phase)) : `<div class="public-seat">${label}</div>`
  }).join('')}</div>`
}

function invitation() {
  if (!invitationQrOpen) return `<button class="invite-qr-trigger" data-action="toggle-invite-qr">扫码进入房间</button>`
  if (!networked) return `<div class="invite-qr-content"><button class="invite-qr-trigger" data-action="toggle-invite-qr">收起二维码</button><p>单机演示模式</p></div>`
  return `<div class="invite-qr-content"><button class="invite-qr-trigger" data-action="toggle-invite-qr">收起二维码</button><img class="lan-qr" src="${apiUrl('/api/qr?kind=room')}" alt="房间加入二维码"><p><a href="${escaped(lan.roomUrl || '#')}">${escaped(lan.roomUrl || '')}</a></p></div>`
}

function renderComputer() {
  document.querySelector('#computer-catalog').innerHTML = scripts.map(script => `<article class="computer-script">${scriptCover(script, true)}<div><h2>${escaped(script.title)}</h2><p>${script.players} 人 · 原创悬疑 · 两轮线索</p><p>${escaped(script.description)}</p><p class="muted">${escaped(script.status)}</p></div></article>`).join('')
  const script = selectedScript()
  const arrived = state.joined.filter(Boolean).length
  document.querySelector('#computer-room').innerHTML = `<details class="host-panel computer-seat-panel"><summary>${escaped(script.title)} · ${arrived}/5 人入席</summary><p>房间码 ${state.roomCode || '待创建'} · ${state.host === 'ai' ? 'AI 主持' : '真人主持'}</p><div class="room-status"><span>${state.roles.filter(role => role !== null).length} / 5 已选角色</span></div>${seatList()}</details>`
  document.querySelector('#computer-events').innerHTML = state.events.length ? state.events.slice(-60).map(event => `<p>${escaped(event)}</p>`).join('') : '<p>等待房间操作。</p>'
}

let computerIdleTimer
function showComputerPanels() {
  const waiting = ['join', 'ready'].includes(state.phase)
  if (endpoint !== 'computer' || !waiting) {
    clearTimeout(computerIdleTimer)
    computerIdleTimer = null
    document.body.classList.remove('computer-panels-hidden')
    return
  }
  document.body.classList.remove('computer-panels-hidden')
  clearTimeout(computerIdleTimer)
  computerIdleTimer = setTimeout(() => document.body.classList.add('computer-panels-hidden'), 11 * 60 * 1000)
}
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' && endpoint === 'computer') showComputerPanels()
}, { passive: true })
document.addEventListener('pointerdown', () => { if (endpoint === 'computer') showComputerPanels() }, { passive: true })

function publicClue(round) {
  return { title: `第${round}轮公共线索`, text: '这一轮所有玩家都能阅读的公共信息，将放在这里。' }
}

function personalClue(round, owner) {
  return { title: `${roleName(owner)}的第${round}轮个人线索`, text: `这是一条仅对${roleName(owner)}开放的第${round}轮测试信息。正式线索原文将在这里呈现。` }
}

function cluesUnlocked() {
  return !['create', 'join', 'ready', 'consent', 'intro', 'ask'].includes(state.phase)
}

function publicClues() {
  if (!cluesUnlocked()) return '<p>初始提问结束后统一开放第一轮线索。</p>'
  let html = ''
  for (let round = 1; round <= roundNumber(); round++) {
    const clue = publicClue(round)
    html += `<article class="clue-card"><h4>${clue.title}</h4><p>${clue.text}</p></article>`
    html += state.shared.filter(id => Number(id.split('-')[0]) === round).map(id => {
      const owner = Number(id.split('-')[1])
      const clue = personalClue(round, owner)
      return `<article class="clue-card"><h4>${clue.title}</h4><small>${roleName(owner)}已公开给全桌</small><p>${clue.text}</p></article>`
    }).join('')
  }
  return html
}

function publicInformation() {
  return `<details class="host-panel computer-live-panel"><summary>全桌进行中 · ${byId[state.phase][1]}</summary><div class="public-facts"><p>当前发言　${state.speaker === null ? '暂无' : roleName(state.speaker)}</p><p>提问对象　${state.target === null ? '暂无' : roleName(state.target)}</p><p>提问排队　${state.queue.length ? state.queue.map(roleName).join(' → ') : '暂无'}</p><p>计时　${state.remaining === null ? '不限时' : timeText()}</p><p>录音　${state.recorded ? '同意，功能待接入' : '关闭'} · 识别待接入</p></div>${['join', 'ready'].includes(state.phase) ? `<p>角色 ${state.roles.filter(role => role !== null).length}/5 · 已准备 ${state.ready.filter(Boolean).length}/5</p>` : ''}${['clue1', 'clue2'].includes(state.phase) ? `<p>本轮已读　公共 ${state.read[roundNumber()].filter(read => read[0]).length}/5 · 个人 ${state.read[roundNumber()].filter(read => read[1]).length}/5</p>` : ''}${state.phase === 'vote' ? `<p>已投 ${state.votes.filter(vote => vote !== undefined).length}/5 人</p>` : ''}</details><details class="host-panel"><summary>公共线索与玩家公开内容</summary>${publicClues()}</details><details class="host-panel"><summary>全桌阶段总结</summary>${Object.keys(state.summaries).length ? Object.entries(state.summaries).map(([round, text]) => `<h4>第${round}轮</h4><p>${escaped(text || '等待补记，玩家可在总结页修订。')}</p>`).join('') : '<p>讨论结束后整理在这里。</p>'}</details>`
}

function renderPublicInformation() {
  const html = publicInformation()
  document.querySelector('#computer-public').innerHTML = html

}

function renderHostOverview() {
  const automatic = state.host === 'ai' && !state.manualControl
  document.querySelector('#host-phase').textContent = byId[state.phase][1]
  document.querySelector('#host-running').textContent = state.hostDisconnected ? '主持离线 · 已暂停' : state.paused ? '已暂停' : automatic ? '自动流程演示中' : '手动主持中'
  document.querySelector('#host-controls-title').textContent = automatic ? '自动主持与接管' : '流程控制'
  document.querySelector('#host-next-condition').textContent = state.remaining === null ? '' : `剩余 ${timeText()}`
  const progress = state.roles.map((role, index) => {
    let status = role === null ? '尚未入席' : '已入席'
    if (state.phase === 'ready') status = state.ready[index] ? '已准备' : '阅读角色卡'
    if (state.phase === 'consent') status = state.consent[index] === null ? '等待回应' : '已回应'
    if (state.phase === 'intro') status = state.introduced[index] ? '介绍已完成' : state.speaker === index ? '正在介绍' : '等待介绍'
    if (isDiscussion()) status = state.speaker === index ? '正在发言' : state.queue.includes(index) ? '排队中' : state.confirmed[index] ? '已确认结束' : '讨论中'
    if (['clue1', 'clue2'].includes(state.phase)) {
      const read = state.read[roundNumber()][index]
      status = `公共${read[0] ? '已读' : '未读'} · 个人${read[1] ? '已读' : '未读'}`
    }
    if (state.phase === 'vote') status = state.votes[index] === undefined ? '尚未提交' : '已提交'
    if (state.disconnected[index]) status = '设备离线'
    return `<div class="host-progress-row"><span>${role === null ? `玩家设备 ${index + 1}` : names[role]}</span><span>${status}</span></div>`
  }).join('')
  document.querySelector('#host-progress').innerHTML = progress
  document.querySelector('#host-public-messages').innerHTML = state.messages.length ? state.messages.map(message => `<div class="host-message"><strong>${escaped(message.author)}</strong><p>${escaped(message.text)}</p></div>`).join('') : '<p class="host-description">请求解释与主持回复会显示在这里。</p>'
  document.querySelector('#host-services').innerHTML = `<div class="service-item"><span>主持</span><span>${state.host === 'ai' ? '本机预设流程 · AI 服务待接入' : '真人操作'}</span></div><div class="service-item"><span>录音</span><span>${state.recorded ? '已获全员同意 · 服务待接入' : '关闭'}</span></div><div class="service-item"><span>语音识别</span><span>待接入</span></div><div class="service-item"><span>音乐</span><span>待接入</span></div>`
}

function renderHost() {
  const phase = state.phase
  const box = document.querySelector('#host-body')
  document.querySelector('#host-mode-label').textContent = state.host === 'ai' ? 'AI 主持 · 预设流程演示' : '真人主持'
  let description = ''
  let controls = ''
  let detail = ''
  if (phase === 'create') {
    description = '等待第一位玩家选本并创建房间。'
  } else if (phase === 'join') {
    description = '等待五名玩家在各自设备中选择角色。'
    controls = `${action('演示：五人入席并开始流程', 'demo-start-flow')}${action('模拟其余玩家入席', 'fill-roles')}${action('进入角色阅读', 'to-ready', '', true, state.roles.includes(null))}`
  } else if (phase === 'ready') {
    description = `已有 ${state.ready.filter(Boolean).length} / 5 人准备好。开局前可换选角色。`
    controls = `${action('演示：五人入席并开始流程', 'demo-start-flow')}${action('模拟其余玩家准备', 'fill-ready')}${action('返回选角', 'back-join')}${action('全员准备，继续', 'to-consent', '', true, !state.ready.every(Boolean))}`
  } else if (phase === 'consent') {
    description = `已收到 ${state.consent.filter(value => value !== null).length} / 5 人的回应。任一人拒绝即关闭录音与识别。原型会演示录音不可用时继续游戏。`
    controls = `${action('模拟其余人同意', 'fill-consent')}${action('正式开场', 'start', '', true, state.consent.includes(null))}`
  } else if (phase === 'intro') {
    description = state.introQueueStarted ? `已完成 ${state.introduced.filter(Boolean).length} / 5 席介绍。其余玩家可在当前介绍期间排队或取消。` : `已有 ${state.queue.length} / 5 人举手。五人都准备并举手后，才按队列开始介绍。`
    controls = `${action('主持代点下一位', 'next-speaker', '', false, state.speaker === null)}${action('模拟完成其余介绍', 'fill-intro')}${action('进入初始提问', 'intro-end', '', true, !state.introduced.every(Boolean))}`
  } else if (isDiscussion()) {
    description = state.speaker === null ? `队列已清空。${state.remaining > 0 ? '一分钟收尾后收集全员确认。' : `已确认 ${state.confirmed.filter(Boolean).length} / 5 人。`}` : `${roleName(state.speaker)}正在提问${state.target === null ? '' : `，被问者为${roleName(state.target)}`}。`
    controls = `${action('主持代点下一位', 'next-speaker', '', false, state.speaker === null)}${action('体验用 · 结束收尾计时', 'skip-countdown', '', false, state.speaker !== null || state.remaining === 0)}${action('主持代全员确认', 'fill-confirm', '', false, state.speaker !== null || state.remaining !== 0)}${action(phase === 'tie' ? '开始复投' : '进入下一阶段', 'discussion-end', '', true, !state.confirmed.every(Boolean))}`
  } else if (phase === 'clue1' || phase === 'clue2') {
    const read = state.read[roundNumber()]
    description = `公共线索 ${read.filter(value => value[0]).length} / 5 已读，个人线索 ${read.filter(value => value[1]).length} / 5 已读。`
    controls = `${action('模拟其余玩家读完', 'fill-read')}${action('开始讨论', 'clues-end', '', true, !read.every(value => value.every(Boolean)))}`
  } else if (phase === 'vote') {
    description = `第 ${state.voteRound} 轮秘密投票。请在手机中提交选择。到时未提交按弃票。`
    controls = `${action('模拟其余票 · 唯一最高', 'fill-votes', 'unique')}${action('模拟其余票 · 平票', 'fill-votes', 'tie')}${action('体验用 · 立即到时收票', 'vote-timeout')}`
  } else if (phase === 'tally') {
    description = state.winner === null ? '本轮最高票平票或全员弃票，需要重新讨论与投票。' : '唯一出局者已确定，即将进入退场演出。'
    controls = action(state.winner === null ? '重新讨论' : '开始退场', 'tally-next', '', true)
  } else if (phase === 'exit') {
    description = '出局木偶向幕后退场。声音制作在后续接入。'
    controls = action('退场结束，进入静默', 'exit-end', '', true)
  } else if (phase === 'silence') {
    description = '静默两秒后，AI 模式自动揭晓，真人模式由主持推进。'
    if (state.host === 'human' || state.manualControl) controls = action('揭晓身份', 'silence-end', '', true, state.remaining !== 0)
  } else if (phase === 'identity') controls = action('查看案件真相', 'identity-end', '', true)
  else if (phase === 'truth') controls = action('查看胜负结果', 'truth-end', '', true)
  else if (phase === 'outcome') controls = action('结束本局', 'outcome-end', '', true)
  else if (phase === 'ended') {
    description = '本局流程已结束。正式版本中，房主在这里决定录音保留或删除，默认保留。'
    controls = `${action(state.keptRecording ? '录音处置 · 默认保留' : '录音处置 · 已选删除', 'record-disposition')}${action('再体验一局', 'reset', '', true)}`
  }
  if (state.phase !== 'create') detail += `<div class="queue">${state.queue.length ? `提问排队　${state.queue.map(roleName).join(' → ')}` : ''}</div>`
  const temporary = document.createElement('div')
  temporary.innerHTML = controls
  const demoActions = ['demo-start-flow', 'fill-roles', 'fill-ready', 'fill-consent', 'fill-intro', 'fill-read', 'fill-votes', 'skip-countdown', 'vote-timeout']
  const demo = document.querySelector('#demo-actions')
  demo.replaceChildren()
  temporary.querySelectorAll('button').forEach(button => {
    if (demoActions.includes(button.dataset.action)) demo.appendChild(button)
  })
  demo.insertAdjacentHTML('beforeend', `${action(state.disconnected[player] ? '模拟玩家重连' : '模拟当前玩家断线', state.disconnected[player] ? 'reconnect' : 'disconnect', '', false, phase === 'create')}${action(state.hostDisconnected ? '模拟主持重连' : '模拟主持断线', state.hostDisconnected ? 'host-reconnect' : 'host-disconnect', '', false, state.host !== 'human' || phase === 'create')}`)
  if (phase !== 'create' && !hasJoined()) demo.insertAdjacentHTML('beforeend', action('模拟扫描房主房间二维码', 'simulate-scan-room'))
  if (isDiscussion()) demo.insertAdjacentHTML('beforeend', action('模拟其余玩家确认结束', 'simulate-confirm', '', false, state.speaker !== null || state.remaining !== 0))
  controls = temporary.innerHTML
  if (state.host === 'ai' && !state.manualControl && !['create', 'ended'].includes(phase)) {
    controls = `${action('人工接管', 'takeover')}${action('暂停自动主持', 'pause')}`
  } else if (state.host === 'ai' && state.manualControl && phase !== 'ended') controls += action('交回自动主持', 'release-host')
  if (phase === 'ended') controls = ''
  if (state.paused) controls = `${action('确认继续', 'resume', '', true)}${state.host === 'ai' && !state.manualControl ? action('人工接管', 'takeover') : ''}`
  if (state.hostDisconnected) controls = '<p class="host-description">等待原主持设备恢复连接。</p>'
  box.innerHTML = `${description ? `<p class="host-description">${description}</p>` : ''}${detail}<div class="actions">${controls}</div>`
  renderHostOverview()
}

function clueCards() {
  const saved = readPrivateNotes().favorites.includes('timeline-placeholder') ? '<section class="saved-facts"><h3>我的收藏</h3><p class="story-highlight saved">关键时间 · 正文待填</p></section>' : ''
  if (!cluesUnlocked()) return `<h3>线索资料</h3>${saved}<h3>线索尚未开放</h3><p>初始提问结束后，同一轮公共线索与个人线索会同时到达并按轮次整理。</p>`
  let html = `<h3>线索资料</h3>${saved}<nav class="clue-links"><a href="#public-clue-section">公共线索</a><a href="#personal-clue-section">个人线索</a></nav><section id="public-clue-section"><h3>公共线索</h3>`
  for (let round = 1; round <= roundNumber(); round++) {
    const clue = publicClue(round)
    const read = state.read[round][player][0]
    html += `<article class="clue-card"><small>第${round}轮 · 全桌可见</small><h4>${clue.title}</h4><p>${clue.text}</p>${action(read ? '公共线索已读 ✓' : '确认公共线索已读', 'read', `${round}-0`, false, read)}</article>`
    html += state.shared.filter(id => Number(id.split('-')[0]) === round).map(id => {
      const owner = Number(id.split('-')[1])
      const clue = personalClue(round, owner)
      return `<article class="clue-card"><small>${roleName(owner)}已公开 · 第${round}轮</small><h4>${clue.title}</h4><p>${clue.text}</p></article>`
    }).join('')
  }
  html += '</section><section id="personal-clue-section"><h3>个人线索</h3>'
  for (let round = 1; round <= roundNumber(); round++) {
    const clue = personalClue(round, player)
    const id = `${round}-${player}`
    const read = state.read[round][player][1]
    const published = state.shared.includes(id)
    html += `<article class="clue-card"><small>第${round}轮 · ${published ? '已向全桌公开' : '本人可见'}</small><h4>${clue.title}</h4><p>${clue.text}</p>${action(read ? '个人线索已读 ✓' : '确认个人线索已读', 'read', `${round}-1`, false, read)}${action(published ? '已公开给全桌' : '公开这条线索', 'share', id, false, published)}${pendingShare === id ? `<div class="share-confirm"><p>确认把这条线索的完整内容公开给全桌吗？公开后会保留。</p>${action('确认公开', 'confirm-share', id, true)}${action('取消', 'cancel-share')}</div>` : ''}</article>`
  }
  return html + '</section>'
}

function lobbyPhone() {
  const role = state.roles[player]
  const sections = [
    ['roles','选择角色',`<p>已进入 <mark>${state.joined.filter(Boolean).length}/5 人</mark> · 已选角色 ${state.roles.filter(value=>value!==null).length}/5 人</p><div class="role-choices">${names.map((name,index)=>`<button data-action="pick-role" data-value="${index}" ${state.roles.includes(index)&&role!==index?'disabled':''} class="${role===index?'selected':''}">${name}<span>${role===index?'我的角色':state.roles.includes(index)?'已被选择':'可选择'}</span></button>`).join('')}</div>`],
    ['seats','查看与更换座位',`<p>${role===null?'选择角色后随机安排空座。':`你在 <mark>${state.seats[player]+1} 号座位</mark>，开局前可以更换空座。`}</p>${seatList(true)}`],
    ...storySections().slice(0,2),
    ['my-role','我的角色卡',role===null?'<p>选择角色后在此阅读本人角色卡。</p>':roleCard()],
    ['invitation','扫码进入房间',player===state.roomOwner?invitation():'<p>扫描房主提供的二维码，输入房间码后加入。</p>'],
  ]
  return `<div class="fixed-player-page lobby-page">${accordion(sections)}<footer class="fixed-actions">${action(state.ready[player]?'已准备 ✓':'已读，准备好了','ready','',true,role===null||state.ready[player])}</footer></div>`
}

function discussionPhone() {
  const speaking = state.speaker === player
  const queued = state.queue.includes(player)
  let html = `<h3>${speaking ? '轮到你了' : state.phase === 'intro' && !state.introQueueStarted ? '等待全员准备介绍' : '听一听，也问一问'}</h3><p>${state.phase === 'intro' && !state.introQueueStarted ? `已有 ${state.queue.length}/5 人举手。五人都准备好并加入队列后，才开始介绍。` : state.speaker === null ? '现在没有人举手，可以发起新的提问。' : `${roleName(state.speaker)}正在发言。`}</p><div class="actions">`
  if (speaking) html += action('说完了，下一位', 'next-speaker', '', true)
  else if (state.phase === 'intro' && state.introduced[player]) html += action(state.askQueue.includes(player) ? '取消提问排队' : '排队申请提问', state.askQueue.includes(player) ? 'cancel-ask' : 'queue-ask', '', true)
  else html += action(queued ? '取消排队' : state.phase === 'intro' && !state.introQueueStarted ? '举手加入介绍队列' : '举手发言', queued ? 'cancel-queue' : 'queue', '', true)
  if (state.phase === 'intro' && state.introduced[player] && !speaking) html += `<p class="muted">自我介绍已完成。你可以提前排队提问，听到问题后也能取消。</p>`
  html += '</div>'
  if (speaking && isDiscussion()) html += `<h4>这次想问谁</h4><div class="actions">${names.map((_, index) => index === player ? '' : action(roleName(index), 'target', index, state.target === index)).join('')}</div>`
  if (isDiscussion() && state.speaker === null && state.remaining === 0) html += `<h4>讨论结束确认</h4>${action(state.confirmed[player] ? '已确认 ✓' : '我已讨论完毕', 'confirm', '', true, state.confirmed[player])}`
  if (state.phase === 'intro') html += `<p class="muted">你的介绍${state.introduced[player] ? '已完成' : '尚未完成'}。${state.introQueueStarted ? '介绍发言没有个人时限，可以在他人发言时继续排队。' : '介绍发言没有个人时限。'}</p>`
  return html
}

function stagePhone() {
  const phase = state.phase
  if (phase === 'create') return '<p>请先选本开房。</p>'
  if (['join', 'ready'].includes(phase)) return lobbyPhone()
  if (phase === 'consent') return `<h3>关于录音</h3><p>录音保存在电脑主机，用于回听与阶段总结。全员同意后才开启录音和识别。</p><p>任何一人不同意，游戏仍会正常开始。</p><div class="actions">${action('同意录音', 'consent', 'yes', state.consent[player] === true)}${action('不同意', 'consent', 'no', state.consent[player] === false)}</div><p class="muted">本次浏览器原型不会访问麦克风。</p>`
  if (phase === 'intro' || isDiscussion()) return discussionPhone()
  if (phase === 'clue1' || phase === 'clue2') return clueCards()
  if (phase === 'vote') {
    if (state.votes[player] !== undefined) return '<h3>已提交你的选择</h3><p>请等待大家完成投票。全部结束后统一公开票型。</p>'
    return `<h3>你认为是谁</h3><p>第 ${state.voteRound} 轮投票，可投给任何玩家，也可以弃票。</p><div class="role-choices">${names.map((name, index) => action(name, 'select-vote', index, state.selectedVote === index)).join('')}${action('弃票', 'select-vote', 'abstain', state.selectedVote === 'abstain')}</div><div class="actions" style="margin-top:17px">${action('确认提交', 'submit-vote', '', true, state.selectedVote === null)}</div>`
  }
  if (phase === 'tally') {
    const result = state.history.at(-1)
    return `<h3>本轮公开票型</h3>${result.votes.map((vote, index) => `<div class="receipt"><span>${roleName(index)}</span><span>${vote === null ? '弃票' : names[vote]}</span></div>`).join('')}<p>${state.winner === null ? '重新讨论后复投。' : `${names[state.winner]}出局。`}</p>`
  }
  if (['exit', 'silence'].includes(phase)) return '<h3>一席落幕</h3><p>请看向公共舞台，真相即将揭晓。</p>'
  if (phase === 'identity') return `<h3>测试身份揭晓</h3><p>测试凶手为${names[4]}。</p><p>出局角色为${names[state.winner]}。</p>`
  if (phase === 'truth') return '<h3>案件真相</h3><p>正式案件的完整真相与线索解释将在这里呈现。</p><p class="muted">当前为空白测试局。</p>'
  if (phase === 'outcome') return `<h3>${state.winner === 4 ? '其他玩家获胜' : '凶手获胜'}</h3><p>本次结果依据测试身份与票型自动计算。</p>`
  return `<h3>这一局，结束了</h3><p>你可以回看已开放线索和阶段总结。正式版本中，这里还会提供主机录音的网页回听。</p>${player === state.roomOwner ? action(state.keptRecording ? '录音处置 · 默认保留' : '录音处置 · 已选删除', 'record-disposition') : ''}`
}

function renderPhone() {
  document.querySelector('#player-switch').innerHTML = names.map((_, index) => `<button data-action="player" data-value="${index}" class="${player === index ? 'active' : ''}" aria-label="切换到设备${index + 1}">${state.roles[index] === null ? `设备 ${index + 1}` : roleName(index)}</button>`).join('')
  document.querySelector('#phone-name').textContent = state.phase === 'create' ? '围桌 · 选本' : !hasJoined() ? '加入朋友的房间' : ['join', 'ready'].includes(state.phase) ? '等候入席' : roleName(player)
  document.querySelector('#phone-phase').textContent = state.phase === 'create' ? '线下同桌' : hasJoined() ? byId[state.phase][1] : '扫码入口'
  document.querySelector('#phone-role-label').textContent = state.disconnected[player] ? '设备已离线' : state.phase === 'create' ? '手机游戏入口' : `${player === state.roomOwner ? '房主 · ' : ''}玩家 ${player + 1}`
  document.querySelector('#player-director').innerHTML = `<span>${state.host === 'ai' ? 'AI 幕后主持 · 演示' : '主持提示'}</span><p>${escaped(directorPrompt())}</p>${state.paused ? action('确认继续', 'resume', '', true) : state.host === 'ai' && !['create', 'ended'].includes(state.phase) ? action('请求主持解释／暂停', 'explain') : ''}`
  document.querySelector('#enter-player-scene').disabled = state.roles[player] === null || state.disconnected[player]
  document.querySelector('#player-scene-name').textContent = `${roleName(player)} · 围桌场景`
  const body = document.querySelector('#phone-body')
  const lobby = hasJoined() && ['join','ready'].includes(state.phase) && tab === 'stage'
  document.querySelector('.phone').classList.toggle('lobby-mode', lobby)
  document.querySelector('.phone').classList.toggle('entry-mode', !hasJoined())
  body.classList.toggle('fixed-content', !hasJoined() || lobby)
  document.querySelector('#phone-room-code').hidden = !hasJoined()
  document.querySelector('#phone-room-code').innerHTML = hasJoined() ? `<span><strong>${state.roomCode}</strong><small>${state.joined.filter(Boolean).length}/5</small></span>${action('复制','copy-room-code')}` : ''
  if (!hasJoined()) {
    document.querySelector('#phone-name').textContent = '围桌 · 游戏入口'
    document.querySelector('#phone-role-label').textContent = '线下同桌'
  }
  if (hasJoined() && state.disconnected[player]) body.innerHTML = `<h3>连接已断开</h3><p>重连后恢复当前阶段和本人操作状态。</p>${action('模拟重连', 'reconnect', '', true)}`
  else if (!hasJoined()) body.innerHTML = roomEntry()
  else if (tab === 'public') body.innerHTML = `<div class="phone-public">${publicInformation()}</div>`
  else if (tab === 'role') body.innerHTML = roleCard()
  else if (tab === 'clues') body.innerHTML = clueCards()
  else if (tab === 'summary') {
    const rounds = Object.keys(state.summaries)
    body.innerHTML = `<h3>阶段总结</h3>${rounds.length ? rounds.map(round => `<div class="clue-card"><h4>第${round}轮讨论</h4><p>${state.summaries[round] ? escaped(state.summaries[round]) : '总结服务尚未接入，可以手工补记。'}</p>${action('补记或修订', 'edit-summary', round)}</div>`).join('') : '<p>每轮讨论结束后，这里会留下全桌可见的总结。</p>'}${state.versions.length ? `<h4>版本历史</h4>${state.versions.map(version => `<p class="muted">${escaped(version.author)} · 第${version.round}轮 · ${escaped(version.text)}</p>`).join('')}` : ''}`
  } else if (tab === 'help') {
    body.innerHTML = `<h3>请求主持解释</h3>${state.messages.map(message => `<div class="chat-message"><strong>${escaped(message.author)}</strong>${escaped(message.text)}</div>`).join('')}<form id="host-question-form"><label for="host-question">关于当前流程的问题</label><input id="host-question" maxlength="300" required><button type="submit">请求解释并暂停</button></form><p>当前主持回复为预设演示。</p>`
  } else body.innerHTML = stagePhone()
  if (hasJoined() && !lobby && ['role','clues','summary','public'].includes(tab)) {
    const content = body.innerHTML
    const titles = { role:'我的角色卡', clues:'线索资料', summary:'阶段总结', public:'全桌信息' }
    body.classList.add('fixed-content')
    body.innerHTML = `<div class="fixed-player-page">${accordion([[`read-${tab}`,titles[tab],content]])}</div>`
  }
  const unread = cluesUnlocked() ? Array.from({ length: roundNumber() }, (_, index) => state.read[index + 1][player].filter(read => !read).length).reduce((a, b) => a + b, 0) : 0
  const newShares = state.shared.filter(id => !state.seenShared[player].includes(id)).length
  document.querySelector('#clue-notice').innerHTML = cluesUnlocked() ? action(`线索资料 · ${unread + newShares ? `${unread + newShares} 项待查看` : '均已查看'} · 公共 / 个人`, 'tab', 'clues') : '<span>线索入口 · 初始提问后开放</span>'
  const tabs = [['stage', '本轮操作'], ['role', '角色卡'], ['clues', '线索资料'], ['summary', '总结'], ['public', '全桌']]
  document.querySelector('#phone-tabs').innerHTML = tabs.map(([key, label]) => `<button data-action="tab" data-value="${key}" class="${tab === key ? 'active' : ''}">${label}</button>`).join('')
  renderStageDrawer()
}

function renderStageDrawer() {
  const drawer = document.querySelector('.stage-drawer')
  const content = document.querySelector('.stage-drawer-content')
  const title = document.querySelector('#stage-drawer-title')
  const labels = { operation: '本轮操作', role: '角色卡', clues: '线索资料', summary: '阶段总结', public: '全桌信息', invite: '扫码进入房间', settings: '设置' }
  // 电脑主机只展示公共信息和主持状态，不承载玩家的本轮操作。
  if (endpoint === 'computer' && stagePanel === 'operation') stagePanel = null
  drawer.hidden = !stagePanel
  if (!stagePanel) return
  title.textContent = labels[stagePanel] || labels.operation
  if (stagePanel === 'operation') content.innerHTML = stagePhone()
  else if (stagePanel === 'role') content.innerHTML = roleCard()
  else if (stagePanel === 'clues') content.innerHTML = clueCards()
  else if (stagePanel === 'public') content.innerHTML = endpoint === 'computer'
    ? `${document.querySelector('#computer-room').innerHTML}${document.querySelector('#computer-public').innerHTML}<details class="host-panel"><summary>电脑调试记录</summary>${document.querySelector('#computer-events').innerHTML}</details>`
    : `<div class="phone-public">${publicInformation()}</div>`
  else if (stagePanel === 'invite') content.innerHTML = `<div class="stage-room-code"><strong>${state.roomCode || '尚未创建房间'}</strong>${hasJoined() ? action('复制房间码', 'copy-room-code') : ''}</div>${invitation()}`
  else if (stagePanel === 'settings') content.innerHTML = `<h3>音乐速度</h3><label class="music-rate-control">电脑主机调整，全桌同步 <select class="music-rate-select"><option value="0.8">0.8×</option><option value="0.85">0.85×</option><option value="0.9">0.9×</option><option value="0.95">0.95×</option><option value="1">1.0×</option></select></label><button data-action="music-library">打开曲库</button><h3>画质</h3><p>玩家端画质档位入口已预留。</p>`
  else {
    const rounds = Object.keys(state.summaries)
    content.innerHTML = `<h3>阶段总结</h3>${rounds.length ? rounds.map(round => `<div class="clue-card"><h4>第${round}轮讨论</h4><p>${state.summaries[round] ? escaped(state.summaries[round]) : '总结服务尚未接入，可以手工补记。'}</p>${action('补记或修订', 'edit-summary', round)}</div>`).join('') : '<p>每轮讨论结束后，这里会留下全桌可见的总结。</p>'}${state.versions.length ? `<h4>版本历史</h4>${state.versions.map(version => `<p class="muted">${escaped(version.author)} · 第${version.round}轮 · ${escaped(version.text)}</p>`).join('')}` : ''}`
  }
}

function renderEndpoints() {
  for (const name of ['computer', 'host', 'player', 'test']) document.querySelector(`#endpoint-${name}`).hidden = endpoint !== name
  document.querySelectorAll('button[data-endpoint]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.endpoint === endpoint)))
  const inRoom = state.phase !== 'create' && hasJoined()
  const showPlayerScene = endpoint === 'player' && inRoom && tab === 'stage'
  // 玩家端以及双玩家测试的房主 iframe，刷新后都恢复为竖屏入席。
  if (showPlayerScene && ['join', 'ready'].includes(state.phase)) {
    playerSceneOpen = true
    if (sceneView && document.querySelector('.theatre')?.dataset.immersiveOrientation !== 'portrait') {
      sceneView.enterImmersive('portrait')
    }
  }
  const theatre = document.querySelector('.theatre')
  document.querySelector('.computer-periphery').hidden = endpoint !== 'computer'
  const mount = document.querySelector(showPlayerScene ? '#player-stage-mount' : '#computer-stage-mount')
  if (theatre.parentElement !== mount) mount.appendChild(theatre)
  document.querySelector('#player-personal').hidden = false
  document.querySelector('#player-scene').hidden = !showPlayerScene
  document.querySelector('#stage-screen-label').textContent = showPlayerScene ? (state.roles[player] === null ? '等候入席' : `${roleName(player)} · ${state.seats[player] + 1} 号座位`) : '公共桌面'
  const roomChip = document.querySelector('#stage-room-chip')
  const roomWaiting = ['join', 'ready'].includes(state.phase) && (endpoint === 'player' || endpoint === 'computer')
  roomChip.hidden = !roomWaiting || !hasJoined()
  roomChip.innerHTML = roomWaiting && hasJoined() ? `${state.roomCode} · ${state.joined.filter(Boolean).length}/5 <button data-action="copy-room-code" aria-label="复制房间码">复制</button>` : ''
  document.querySelector('.view-controls').hidden = !(endpoint === 'computer' || showPlayerScene)
  document.querySelector('.quality').hidden = endpoint !== 'player'
  document.querySelector('#computer-welcome').hidden = state.phase !== 'create'
  document.querySelector('#computer-stage-mount').hidden = state.phase === 'create'
  document.querySelector('#computer-room').hidden = state.phase === 'create'
  document.querySelector('#computer-public').hidden = state.phase === 'create'
  document.querySelector('#computer-events').closest('details').hidden = state.phase === 'create'
  document.querySelector('#player-director').hidden = !inRoom
  document.querySelector('#clue-notice').hidden = !inRoom
  document.querySelector('.player-scene-entry').hidden = !showPlayerScene || state.roles[player] === null
  document.querySelector('#phone-tabs').hidden = !inRoom
  document.querySelector('#leave-player-scene').hidden = !playerSceneOpen
  document.querySelector('#enter-player-scene').hidden = playerSceneOpen
  document.querySelector('.phone').classList.toggle('scene-focused', playerSceneOpen && showPlayerScene)
  document.body.dataset.previewEndpoint = endpoint
  document.body.dataset.testDevice = testDevice || ''
  if (endpoint === 'computer' && ['join', 'ready'].includes(state.phase) && !computerIdleTimer) showComputerPanels()
  if (endpoint === 'test') mountPlayerTests()
}

function selectEndpoint(name) {
  endpoint = name
  playerSceneOpen = false
  const url = new URL(location.href)
  url.searchParams.set('endpoint', name)
  history.replaceState(null, '', url)
  renderEndpoints()
  if (name === 'computer') {
    sceneView?.exitImmersive()
    sceneView?.setMode('god')
  }
}

function render() {
  renderPublicInformation()
  renderJourney()
  renderStage()
  renderHost()
  renderComputer()
  renderPhone()
  renderEndpoints()
  renderMusicControls()
  if (networked) renderNetworkControls()
}

function handleAction(name, value) {
  if (name === 'note-mode') {
    const notes = readPrivateNotes()
    notes.mode = value === 'paper' ? 'paper' : 'phone'
    localStorage.setItem(privateNotesKey(), JSON.stringify(notes))
    return renderPhone()
  }
  if (name === 'favorite-toggle') {
    const notes = readPrivateNotes()
    notes.favorites = notes.favorites.includes(value) ? notes.favorites.filter(item => item !== value) : [...notes.favorites, value]
    localStorage.setItem(privateNotesKey(), JSON.stringify(notes))
    return renderPhone()
  }
  if (name === 'save-private-notes') {
    const notes = readPrivateNotes()
    notes.text = document.querySelector('#private-notes')?.value || ''
    localStorage.setItem(privateNotesKey(), JSON.stringify(notes))
    notify('个人笔记已保存在这台设备。')
    return
  }
  if (name === 'accordion') { accordionPanel = value; return renderPhone() }
  if (name === 'toggle-invite-qr') { invitationQrOpen = !invitationQrOpen; return renderPhone() }
  if (name === 'music-toggle') { toggleMusic(); return }
  if (name === 'music-library') { showMusicLibrary(); return }
  if (name === 'close-music-library') { document.querySelector('#music-library-dialog').close(); return }
  if (name === 'settings-placeholder') { notify('设置入口已预留，参数面板待试听后设计。'); return }
  if (name === 'music-rate') {
    if (endpoint !== 'computer') return notify('播放速度只能在电脑主机端调整。')
    if (!networked) { state.musicRate = Number(value); musicAudio.playbackRate = state.musicRate; return renderMusicControls() }
  }
  if (name === 'entry-home') { entryMode = 'home'; creatingRoom = false; scriptDetail = null; accordionPanel = 'story'; return renderPhone() }
  if (name === 'entry-create') { entryMode = 'library'; accordionPanel = 'story'; return renderPhone() }
  if (name === 'entry-join') { entryMode = 'join'; return renderPhone() }
  if (name === 'copy-room-code') { copyRoomCode(); return }
  if (networked && routeNetworkAction(name, value)) return
  const phase = state.phase
  if (name === 'reset') {
    if (!confirm('重新开始将清空这次本机体验，确定吗？')) return
    state = freshState()
    player = 0
    tab = 'stage'
    playerSceneOpen = false
    scriptDetail = null
    creatingRoom = false
    pendingShare = null
    return render()
  }
  if (name === 'script-detail' && phase === 'create') { scriptDetail = value; return render() }
  if (name === 'library-back') { scriptDetail = null; creatingRoom = false; return render() }
  if (name === 'begin-create' && phase === 'create' && scriptDetail === value) { creatingRoom = true; accordionPanel = 'hosting'; return render() }
  if (name === 'cancel-create') { creatingRoom = false; accordionPanel = 'story'; return render() }
  if (name === 'simulate-scan-room') return joinRoom(state.roomCode)
  if (name === 'player') { player = Number(value); state.selectedVote = null; tab = 'stage'; return render() }
  if (name === 'tab') { tab = value; pendingShare = null; playerSceneOpen = false; if (value === 'clues') state.seenShared[player] = [...state.shared]; return render() }
  if (name === 'explain') { state.paused = true; tab = 'help'; playerSceneOpen = false; return render() }
  if (name === 'resume') { state.paused = false; return render() }
  if (name === 'reconnect') { state.disconnected[player] = false; return render() }
  if (name === 'host-reconnect') { state.hostDisconnected = false; return render() }
  if (name === 'takeover') { state.manualControl = true; state.paused = false; return render() }
  if (endpoint === 'player' && phase !== 'create' && !hasJoined()) return notify('请先加入房间。')
  if (state.paused || state.hostDisconnected) return notify('请先恢复主持流程。')
  if (name === 'release-host') { state.manualControl = false; return render() }
  if (name === 'pause') { state.paused = true; return render() }
  if (name === 'host' && phase === 'create') state.host = value
  if (name === 'create' && phase === 'create') {
    const script = scripts.find(item => item.id === value)
    if (!script || scriptDetail !== script.id || !creatingRoom) return notify('请先查看剧本详情，再确认开房。')
    state.scriptId = script.id
    state.roomOwner = player
    state.joined[player] = true
    state.roomCode = String(Math.floor(100000 + Math.random() * 900000))
    endpoint = 'player'
    playerSceneOpen = true
    stagePanel = 'operation'
    go('join')
    sceneView?.enterImmersive('portrait')
    return
  }
  if (name === 'pick-role' && ['join', 'ready'].includes(phase)) {
    const role = Number(value)
    if (!Number.isInteger(role) || role < 0 || role >= names.length) return
    if (state.roles.includes(role) && state.roles[player] !== role) return notify('这个角色已经被选择。')
    state.joined[player] = true
    if (state.seats[player] === null) {
      const available = names.map((_, index) => index).filter(seat => !state.seats.includes(seat))
      state.seats[player] = available[Math.floor(Math.random() * available.length)]
    }
    state.roles[player] = role
    record(`${roleName(player)}入席 ${state.seats[player] + 1} 号座位`)
    state.ready[player] = false
  }
  if (name === 'pick-seat' && ['join', 'ready'].includes(phase) && state.roles[player] !== null) {
    const seat = Number(value)
    if (!Number.isInteger(seat) || seat < 0 || seat > 4 || state.seats.includes(seat)) return notify('请选择一个空座位。')
    state.seats[player] = seat
    state.ready[player] = false
    record(`${roleName(player)}换到 ${seat + 1} 号座位`)
  }
  if (name === 'fill-roles' && phase === 'join') state.roles.forEach((role, index) => {
    state.joined[index] = true
    if (role === null) state.roles[index] = names.findIndex((_, candidate) => !state.roles.includes(candidate))
    if (state.seats[index] === null) state.seats[index] = names.findIndex((_, candidate) => !state.seats.includes(candidate))
  })
  if (name === 'demo-start-flow' && ['join', 'ready'].includes(phase)) {
    state.roles.forEach((role, index) => {
      state.joined[index] = true
      if (role === null) state.roles[index] = names.findIndex((_, candidate) => !state.roles.includes(candidate))
      if (state.seats[index] === null) state.seats[index] = names.findIndex((_, candidate) => !state.seats.includes(candidate))
    })
    state.ready.fill(true)
    state.consent.fill(false)
    state.recorded = false
    record('演示工具补齐五名玩家并准备就绪，按未同意录音继续开场。')
    return go('intro')
  }
  if (name === 'to-ready' && state.roles.every(role => role !== null)) return go('ready')
  if (name === 'back-join' && phase === 'ready') return go('join')
  if (name === 'ready' && ['join', 'ready'].includes(phase) && state.roles[player] !== null) state.ready[player] = true
  if (name === 'fill-ready' && phase === 'ready') state.ready.fill(true)
  if (name === 'to-consent' && state.ready.every(Boolean)) return go('consent')
  if (name === 'consent' && phase === 'consent') state.consent[player] = value === 'yes'
  if (name === 'fill-consent' && phase === 'consent') state.consent = state.consent.map(answer => answer ?? true)
  if (name === 'start' && !state.consent.includes(null)) {
    state.recorded = state.consent.every(Boolean)
    notify(state.recorded ? '演示录音未接入时的降级，游戏继续。' : '有人不同意录音，录音与识别均关闭。')
    return go('intro')
  }
  if (name === 'queue' && (phase === 'intro' || isDiscussion())) queuePlayer(player)
  if (name === 'queue-ask' && phase === 'intro' && state.introduced[player]) queueAsk(player)
  if (name === 'cancel-ask') state.askQueue = state.askQueue.filter(index => index !== player)
  if (name === 'cancel-queue') state.queue = state.queue.filter(index => index !== player)
  if (name === 'next-speaker' && state.speaker !== null) nextSpeaker()
  if (name === 'fill-intro' && phase === 'intro') { state.introduced.fill(true); state.introQueueStarted = true; state.speaker = null; state.queue = [] }
  if (name === 'intro-end' && state.introduced.every(Boolean)) return go('ask')
  if (name === 'target' && state.speaker === player) { state.target = Number(value); record(`${roleName(player)}向${roleName(Number(value))}提问`) }
  if (name === 'skip-countdown' && isDiscussion() && state.speaker === null) state.remaining = 0
  if (name === 'confirm' && isDiscussion() && state.remaining === 0) state.confirmed[player] = true
  if (['fill-confirm', 'simulate-confirm'].includes(name) && isDiscussion() && state.remaining === 0) state.confirmed.fill(true)
  if (name === 'discussion-end' && isDiscussion() && state.confirmed.every(Boolean)) return finishDiscussion()
  if (name === 'read') {
    const [round, part] = value.split('-').map(Number)
    if (round <= roundNumber() && !['create', 'join', 'ready', 'consent', 'intro', 'ask'].includes(phase)) state.read[round][player][part] = true
  }
  if (name === 'fill-read' && ['clue1', 'clue2'].includes(phase)) state.read[roundNumber()].forEach(read => read.fill(true))
  if (name === 'clues-end' && state.read[roundNumber()].every(read => read.every(Boolean))) return go(phase === 'clue1' ? 'discuss1' : 'discuss2')
  if (name === 'cancel-share') pendingShare = null
  if (['share', 'confirm-share'].includes(name) && cluesUnlocked()) {
    const [round, owner] = value.split('-').map(Number)
    if (owner !== player || round < 1 || round > roundNumber() || state.shared.includes(value)) return
    if (name === 'share') pendingShare = value
    else if (pendingShare === value) {
      state.shared.push(value)
      state.seenShared[player].push(value)
      pendingShare = null
      record(`${roleName(player)}公开了第${round}轮个人线索`)
      notify('这条线索的完整内容已加入全桌公共线索区。')
    }
  }
  if (name === 'select-vote' && phase === 'vote') state.selectedVote = value === 'abstain' ? 'abstain' : Number(value)
  if (name === 'submit-vote' && phase === 'vote' && state.votes[player] === undefined && state.selectedVote !== null) {
    state.votes[player] = state.selectedVote === 'abstain' ? null : state.selectedVote
    state.selectedVote = null
  }
  if (name === 'fill-votes' && phase === 'vote') {
    const votes = value === 'tie' ? [0, 0, 1, 1, null] : [4, 4, 4, 1, 2]
    state.votes = state.votes.map((vote, index) => vote === undefined ? votes[index] : vote)
  }
  if ((name === 'vote-timeout' || state.votes.every(vote => vote !== undefined)) && phase === 'vote') return finishVote()
  if (name === 'tally-next' && phase === 'tally') {
    if (state.winner === null) { state.voteRound++; return go('tie') }
    return go('exit')
  }
  if (name === 'exit-end' && phase === 'exit') return go('silence')
  if (name === 'silence-end' && phase === 'silence' && state.remaining === 0) return go('identity')
  if (name === 'identity-end' && phase === 'identity') return go('truth')
  if (name === 'truth-end' && phase === 'truth') return go('outcome')
  if (name === 'outcome-end' && phase === 'outcome') return go('ended')
  if (name === 'record-disposition' && phase === 'ended') { state.keptRecording = !state.keptRecording; notify('已更新处置选择，当前没有真实录音文件。') }
  if (name === 'disconnect') state.disconnected[player] = true
  if (name === 'host-disconnect' && state.host === 'human') state.hostDisconnected = true
  if (name === 'edit-summary') {
    const text = prompt('填写全桌可见的阶段总结', state.summaries[value])
    if (text !== null) { state.summaries[value] = text.slice(0, 3000); state.versions.push({ round: value, author: roleName(player), text: text.slice(0, 3000) }) }
  }
  render()
}

document.addEventListener('click', event => {
  const favoriteButton = event.target.closest('.story-highlight[data-action="favorite-toggle"]')
  if (favoriteButton && suppressFavoriteClick) {
    suppressFavoriteClick = false
    return
  }
  const endpointButton = event.target.closest('button[data-endpoint]')
  if (endpointButton) return selectEndpoint(endpointButton.dataset.endpoint)
  if (event.target.closest('.stage-dock-trigger')) {
    const docks = [...document.querySelectorAll('.theatre .stage-dock')]
    const expanded = !event.target.closest('.stage-dock').classList.contains('stage-dock-open')
    docks.forEach(dock => {
      dock.classList.toggle('stage-dock-open', expanded)
      dock.querySelector('.stage-dock-trigger')?.setAttribute('aria-expanded', String(expanded))
    })
    document.querySelector('.theatre')?.classList.remove('controls-hidden')
    return
  }
  if (event.target.closest('.stage-drawer-close')) {
    stagePanel = null
    renderStageDrawer()
    return
  }
  const stagePanelButton = event.target.closest('[data-stage-panel]')
  if (stagePanelButton) {
    stagePanel = stagePanelButton.dataset.stagePanel
    renderStageDrawer()
    return
  }
  const button = event.target.closest('[data-action]')
  if (button && !button.disabled) handleAction(button.dataset.action, button.dataset.value)
  const trackButton = event.target.closest('[data-music-index]')
  if (trackButton) {
    musicTrackIndex = Number(trackButton.dataset.musicIndex)
    preparationLoop = false
    playMusicTrack(musicLibrary[musicTrackIndex])
  }
})
let favoritePressTimer
let favoriteLongPressReady = false
let suppressFavoriteClick = false
document.addEventListener('pointerdown', event => {
  const button = event.target.closest('.story-highlight[data-action="favorite-toggle"]')
  if (!button) return
  clearTimeout(favoritePressTimer)
  favoriteLongPressReady = false
  favoritePressTimer = setTimeout(() => { favoriteLongPressReady = true }, 500)
})
document.addEventListener('pointerup', event => {
  const button = event.target.closest('.story-highlight[data-action="favorite-toggle"]')
  clearTimeout(favoritePressTimer)
  if (!button || !favoriteLongPressReady) return
  event.preventDefault()
  favoriteLongPressReady = false
  suppressFavoriteClick = true
  handleAction(button.dataset.action, button.dataset.value)
})
document.addEventListener('pointercancel', () => {
  clearTimeout(favoritePressTimer)
  favoriteLongPressReady = false
})
document.addEventListener('contextmenu', event => {
  if (event.target.closest('.story-highlight[data-action="favorite-toggle"]')) event.preventDefault()
})
document.querySelector('.theatre').addEventListener('stage-idle', () => {
  stagePanel = null
  document.querySelectorAll('.stage-dock').forEach(dock => dock.classList.remove('stage-dock-open'))
  renderStageDrawer()
})
document.querySelector('.theatre').addEventListener('click', event => {
  if (event.target.closest('.stage-dock-trigger')) return
  if (document.querySelector('.theatre').dataset.immersive === 'true') document.querySelectorAll('.stage-dock').forEach(dock => dock.classList.add('stage-dock-open'))
})
document.addEventListener('change', event => {
  if (event.target.matches('.music-rate-select')) handleAction('music-rate', event.target.value)
})
document.querySelector('#reset').addEventListener('click', () => handleAction('reset', ''))
function toggleDemo(open) {
  document.querySelector('#demo-panel').hidden = !open
  document.querySelector('#demo-toggle').setAttribute('aria-expanded', String(open))
}
document.querySelector('#demo-toggle').addEventListener('click', () => toggleDemo(document.querySelector('#demo-panel').hidden))
document.querySelector('#demo-close').addEventListener('click', () => toggleDemo(false))
document.querySelector('#enter-player-scene').addEventListener('click', () => {
  playerSceneOpen = true
  renderEndpoints()
  stagePanel = null
  sceneView?.enterImmersive('portrait')
})
document.querySelector('#leave-player-scene').addEventListener('click', () => {
  playerSceneOpen = false
  stagePanel = null
  sceneView?.exitImmersive()
  renderEndpoints()
})
function joinRoom(code) {
  roomCodeDraft = code
  if (networked) return sendRoomAction('join', code)
  if (state.phase === 'create' || code !== state.roomCode) {
    const error = document.querySelector('#join-error')
    if (error) error.textContent = '房间码不正确，或朋友尚未创建房间。'
    return
  }
  if (!['join', 'ready'].includes(state.phase) && !hasJoined()) return notify('本局已经开始，请等待下次开房。')
  state.joined[player] = true
  tab = 'stage'
  record(`玩家 ${player + 1} 加入房间`)
  render()
}

document.addEventListener('submit', event => {
  if (event.target.id === 'join-room-form') {
    event.preventDefault()
    return joinRoom(document.querySelector('#room-code').value.trim())
  }
  if (event.target.id !== 'host-question-form') return
  event.preventDefault()
  if (state.disconnected[player]) return
  const input = document.querySelector('#host-question')
  const text = input.value.trim()
  if (!text) return
  if (networked) { sendRoomAction('explain', text); return }
  state.messages.push({ author: roleName(player), text: text.slice(0, 300) })
  if (state.host === 'ai' && !['create', 'ended'].includes(state.phase)) {
    state.paused = true
    state.messages.push({ author: '主持演示回复', text: '已暂停推进。当前可以查看阶段操作与已开放信息，确认后继续。本原型尚未接入真实 AI。' })
  }
  render()
})

function advanceAutomaticHost() {
  if (state.host !== 'ai' || state.manualControl) return false
  let operation
  switch (state.phase) {
    case 'join': if (!state.roles.includes(null)) operation = 'to-ready'; break
    case 'ready': if (state.ready.every(Boolean)) operation = 'to-consent'; break
    case 'consent': if (!state.consent.includes(null)) operation = 'start'; break
    case 'intro': if (state.introduced.every(Boolean)) operation = 'intro-end'; break
    case 'ask':
    case 'discuss1':
    case 'discuss2':
    case 'tie': if (state.confirmed.every(Boolean)) operation = 'discussion-end'; break
    case 'clue1':
    case 'clue2': if (state.read[roundNumber()].every(read => read.every(Boolean))) operation = 'clues-end'; break
    case 'tally': if (state.phaseSeconds >= 5) operation = 'tally-next'; break
    case 'exit': if (state.phaseSeconds >= 4) operation = 'exit-end'; break
    case 'silence': if (state.remaining === 0) operation = 'silence-end'; break
    case 'identity': if (state.phaseSeconds >= 7) operation = 'identity-end'; break
    case 'truth': if (state.phaseSeconds >= 9) operation = 'truth-end'; break
    case 'outcome': if (state.phaseSeconds >= 7) operation = 'outcome-end'; break
  }
  if (!operation) return false
  handleAction(operation, '')
  return true
}

setInterval(() => {
  if (networked) return
  if (state.paused || state.hostDisconnected) return
  state.phaseSeconds++
  const timerJustEnded = state.remaining === 1
  if (state.remaining !== null && state.remaining > 0) state.remaining--
  if (state.remaining === 0 && state.phase === 'vote') return finishVote()
  if (advanceAutomaticHost()) return
  renderStage()
  for (const panel of document.querySelectorAll('.public-facts')) {
    const timer = panel.children[4]
    timer.textContent = `计时　${state.remaining === null ? '当前不限时' : timeText()}`
  }
  renderHostOverview()
  if (timerJustEnded) { renderHost(); renderPhone() }
}, 1000)

function contrast(foreground, background) {
  const luminance = hex => {
    const channels = hex.match(/\w\w/g).map(channel => parseInt(channel, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return ((Math.max(first, second) + .05) / (Math.min(first, second) + .05)).toFixed(1)
}
document.querySelector('#contrast').textContent = `文字对比度核验　主文字 ${contrast('e6e8e5', '171a1d')}∶1 · 手机正文 ${contrast('282a29', 'e8e6df')}∶1 · 手机辅助文字 ${contrast('5f6361', 'e8e6df')}∶1。`

state = freshState()
render()
if (networked) connectRoom()
window.prototypeSnapshot = () => structuredClone({ ...state, player, tab, endpoint, playerSceneOpen })

async function buildStage() {
  const container = document.querySelector('#stage-canvas')
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x080d0f)
  container.appendChild(renderer.domElement)
  renderer.domElement.setAttribute('aria-label', '五名立体木偶围坐木桌的三维舞台')
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x080d0f, 18, 32)
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 80)
  camera.position.set(0, 9, 13.8)
  camera.lookAt(0, .8, 0)

  const material = (color, roughness = .85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
  // 冷夜场景基线：深灰绿木材与石板地面，暖色只留给极小的烛光。
  const wood = material(0x243331)
  const darkWood = material(0x0d1718)
  const brass = material(0x657874, .68, .24)
  const fabric = material(0x152321)

  function mesh(geometry, surface, parent, position = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, surface)
    object.position.set(...position)
    object.castShadow = true
    object.receiveShadow = true
    parent.add(object)
    return object
  }
  function sphere(parent, radius, surface, position, scale = [1, 1, 1]) {
    const object = mesh(new THREE.SphereGeometry(radius, 24, 16), surface, parent, position)
    object.scale.set(...scale)
    return object
  }
  function cylinder(parent, top, bottom, height, surface, position, segments = 40) {
    return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), surface, parent, position)
  }
  function box(parent, width, height, depth, surface, position) {
    return mesh(new THREE.BoxGeometry(width, height, depth), surface, parent, position)
  }

  const ambient = new THREE.HemisphereLight(0xa8bac0, 0x080d0f, .92)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(0xa9bec4, 1.85)
  key.position.set(-4, 10, 6)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .5, far: 28 })
  key.shadow.normalBias = .04
  scene.add(key)
  const rim = new THREE.PointLight(0x496966, 10, 18)
  rim.position.set(4, 5, -4)
  scene.add(rim)

  const floor = new THREE.Group()
  scene.add(floor)
  cylinder(floor, 5.4, 5.6, .27, darkWood, [0, -.24, 0], 96)
  const floorSlate = material(0x1c2a2a, .94)
  const floorGroove = material(0x0c1516, .96)
  cylinder(floor, 5.35, 5.35, .08, floorSlate, [0, -.06, 0], 96)
  for (let index = -8; index <= 8; index++) {
    const z = index * .59
    const length = Math.sqrt(Math.max(0, 5.25 ** 2 - z ** 2)) * 2
    box(floor, length, .008, .018, floorGroove, [0, -.01, z])
  }
  const edge = mesh(new THREE.TorusGeometry(5.38, .025, 8, 100), brass, floor, [0, -.05, 0])
  edge.rotation.x = Math.PI / 2

  const curtain = material(0x0b1517)
  const back = new THREE.Group()
  scene.add(back)
  for (const side of [-1, 1]) {
    for (let fold = 0; fold < 6; fold++) {
      const drape = cylinder(back, .24, .3, 7, curtain, [side * (5.3 + fold * .33), 2.8, -3.7 + fold * .12], 20)
      drape.scale.z = 1.4
    }
    box(back, .19, 6.4, .2, brass, [side * 5.12, 2.6, -4.1])
  }

  const table = new THREE.Group()
  scene.add(table)
  cylinder(table, 2.25, 2.25, .19, wood, [0, 1.45, 0], 96)
  cylinder(table, 2.14, 2.14, .025, fabric, [0, 1.56, 0], 96)
  const lip = mesh(new THREE.TorusGeometry(2.23, .035, 10, 100), brass, table, [0, 1.52, 0])
  lip.rotation.x = Math.PI / 2
  cylinder(table, .32, .52, 1.22, darkWood, [0, .68, 0])
  for (let index = 0; index < 4; index++) {
    const foot = box(table, .25, .18, 1.1, wood, [Math.sin(index * Math.PI / 2) * .5, .1, Math.cos(index * Math.PI / 2) * .5])
    foot.rotation.y = index * Math.PI / 2
  }

  const props = new THREE.Group()
  scene.add(props)
  const paper = material(0xb8c1bc)
  const envelope = box(props, .53, .018, .36, paper, [-.45, 1.6, .1])
  envelope.rotation.y = .25
  cylinder(props, .07, .07, .025, material(0x514d43), [-.45, 1.625, .1], 24)
  box(props, .35, .12, .42, darkWood, [.5, 1.64, -.3])
  cylinder(table, .07, .075, .35, material(0x9ba7a1), [0, 1.79, -.15], 24)
  const flame = sphere(table, .07, new THREE.MeshBasicMaterial({ color: 0xc8a56c }), [0, 2.02, -.15], [.6, 1.6, .6])
  const candleLight = new THREE.PointLight(0xc59d63, 1.45, 4.5)
  candleLight.position.set(0, 2.1, -.15)
  scene.add(candleLight)

  const dolls = []
  const spotlights = []
  // The two front seats and three rear seats keep every puppet visible from the fixed camera.
  const seats = [[-2.75, -1.55], [-1.55, 2.55], [0, -3.05], [1.55, 2.55], [2.75, -1.55]]
  for (let index = 0; index < 5; index++) {
    const [x, z] = seats[index]
    const seat = new THREE.Group()
    seat.position.set(x, 0, z)
    seat.rotation.y = Math.atan2(-x, -z)
    scene.add(seat)
    // 西式高背椅：软垫座面、四条细腿、两侧扶手和竖向椅背。
    box(seat, .88, .13, .82, darkWood, [0, .64, 0])
    box(seat, .72, .09, .7, material(0x263937), [0, .75, 0])
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(seat, .075, .68, .075, wood, [a * .34, .32, b * .31])
    box(seat, .9, .1, .12, wood, [0, 1.73, -.37])
    for (const bar of [-2, -1, 0, 1, 2]) box(seat, .055, .86, .07, wood, [bar * .15, 1.28, -.37])
    for (const side of [-1, 1]) {
      box(seat, .08, .08, .54, wood, [side * .43, 1.02, -.1])
      box(seat, .07, .42, .07, wood, [side * .43, .84, -.31])
    }

    const doll = buildPuppet(index)
    doll.rotation.y = Math.PI
    seat.add(doll)
    const head = doll.getObjectByName('expressive-head')
    const light = new THREE.SpotLight(0xffe3b8, 0, 8, .46, .65)
    light.position.set(x, 6, z + .6)
    light.target = head
    scene.add(light)
    dolls.push({ seat, doll, head, base: seat.position.clone(), phase: index * 1.7 })
    spotlights.push(light)
  }

  let eco = false
  let lastTime = 0
  let previousFrame = 0
  let frameId
  const views = createStageViews({
    camera, renderer, container, dolls,
    getPlayer: () => player,
    getRole: () => state.roles[player] ?? player,
    notify,
  })
  function resize() {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(container)
  resize()
  document.querySelector('#quality').addEventListener('change', event => {
    eco = event.target.value === 'eco'
    renderer.setPixelRatio(eco ? 1 : Math.min(devicePixelRatio, 1.6))
    renderer.shadowMap.enabled = !eco
    resize()
  })
  function update() {
    props.visible = ['clue1', 'discuss1', 'clue2', 'discuss2', 'vote', 'tally', 'tie'].includes(state.phase)
    const dim = state.phase === 'vote'
    ambient.intensity = dim ? .8 : 1.7
    key.intensity = dim ? 1.05 : 2.9
    candleLight.intensity = dim ? 3.2 : 2.5
    spotlights.forEach((light, index) => { light.intensity = state.speaker !== null && state.roles[state.speaker] === index ? 22 : 0 })
  }
  function animate(timestamp) {
    frameId = requestAnimationFrame(animate)
    if (document.hidden || !container.checkVisibility()) return
    if (timestamp - previousFrame < (eco ? 66 : 32)) return
    const delta = Math.min((timestamp - lastTime) / 1000, .1)
    lastTime = timestamp
    previousFrame = timestamp
    const elapsed = timestamp / 1000
    const retiring = ['exit', 'silence', 'identity', 'truth', 'outcome', 'ended'].includes(state.phase)
    dolls.forEach((item, index) => {
      const owner = state.roles.indexOf(index)
      const seatIndex = owner === -1 ? index : state.seats[owner]
      const [seatX, seatZ] = seats[seatIndex ?? index]
      item.base.set(seatX, 0, seatZ)
      item.doll.rotation.y = Math.atan2(-seatX, -seatZ)
      const out = retiring && index === state.winner
      const multiplier = out ? 1.85 : 1
      item.seat.position.lerp(new THREE.Vector3(item.base.x * multiplier, out ? -.4 : 0, item.base.z * multiplier), Math.min(delta * 2, 1))
      item.doll.scale.lerp(new THREE.Vector3(1, out ? .01 : 1, 1), Math.min(delta * 1.4, 1))
      item.doll.userData.animatePose?.(elapsed, state.speaker !== null && state.roles[state.speaker] === index)
    })
    flame.scale.y = 1.6 + Math.sin(elapsed * 7) * .15
    views.update(delta)
    dolls.forEach((item, index) => { item.doll.visible = state.roles.includes(index) })
    renderer.render(scene, camera)
  }
  document.querySelector('#graphics-status').hidden = true
  update()
  animate(0)
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId); views.dispose(); renderer.dispose() }, { once: true })
  return { update, setMode: views.setMode, enterImmersive: views.enterImmersive, exitImmersive: views.exitImmersive }
}

buildStage().then(view => {
  sceneView = view
  if (endpoint === 'player' && hasJoined() && ['join', 'ready'].includes(state.phase)) {
    playerSceneOpen = true
    stagePanel = 'operation'
    renderPhone()
    renderEndpoints()
    sceneView.enterImmersive('portrait')
  }
}).catch(error => {
  document.querySelector('#graphics-status').textContent = '三维舞台加载失败，仍可体验右侧完整流程。'
  console.error(error)
})


// Each browser session has its own server-assigned identity.
function routeNetworkAction(name, value) {
  if (['script-detail', 'library-back', 'begin-create', 'cancel-create', 'tab', 'host', 'select-vote', 'share', 'cancel-share', 'favorite-toggle', 'save-private-notes', 'note-mode'].includes(name)) return false
  if (name === 'player' || name === 'disconnect' || name === 'host-disconnect' || name === 'reconnect' || name === 'host-reconnect') {
    notify('联机身份由当前设备确定，断线后会自动重连。')
    return true
  }
  if (name === 'reset' && !confirm('清空本局房间，所有设备回到入口，确定吗？')) return true
  if (name === 'create') value = { scriptId: value, host: state.host }
  if (name === 'simulate-scan-room') { name = 'join'; value = state.roomCode }
  if (name === 'submit-vote') {
    if (state.selectedVote === null) { notify('请先选择投票或弃票。'); return true }
    value = String(state.selectedVote)
  }
  if (name === 'edit-summary') {
    const text = prompt('补记或修订本轮总结', state.summaries[value] || '')
    if (text === null) return true
    value = JSON.stringify({ round: value, text })
  }
  if (name === 'explain') { tab = 'help'; playerSceneOpen = false }
  if (name === 'confirm-share' && pendingShare !== value) return true
  sendRoomAction(name, value)
  return true
}
async function sendRoomAction(name, value) {
  if (!lan.connected) { notify('连接尚未恢复，请稍候。'); return }
  const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  try {
    const response = await fetch(apiUrl('/api/action'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value, requestId }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    if (name === 'join' || name === 'create') {
      accordionPanel = 'roles'
      roomCodeDraft = ''
      playerSceneOpen = true
      stagePanel = 'operation'
    }
    if (name === 'confirm-share') pendingShare = null
    if (name === 'submit-vote') state.selectedVote = null
    acceptRoomSnapshot(data, true)
  } catch (error) {
    const inline = name === 'join' && document.querySelector('#join-error')
    if (inline) inline.textContent = error.message
    else notify(error.message || '操作未完成，请重试。')
  }
}
function acceptRoomSnapshot(data, force = false) {
  const phaseChanged = state.phase !== data.state.phase
  const changed = data.revision !== lan.revision || force
  const localVote = state.selectedVote
  const localHost = state.host
  const seenShared = state.seenShared
  lan = { ...data, connected: true }
  state = data.state
  state.musicRate ??= 0.9
  state.introQueueStarted ??= false
  state.askQueue ??= []
  musicAudio.playbackRate = Number(state.musicRate)
  state.votes = state.votes.map((vote, index) => data.voted[index] ? vote : undefined)
  state.selectedVote = phaseChanged ? null : localVote
  state.seenShared = seenShared
  if (state.phase === 'create') state.host = localHost
  player = data.me ?? 0
  if (phaseChanged) {
    tab = 'stage'
    pendingShare = null
    accordionPanel = 'roles'
    if (state.phase === 'create') { playerSceneOpen = false; stagePanel = null }
    else if (state.phase === 'join') { playerSceneOpen = endpoint === 'player'; stagePanel = 'operation' }
    else stagePanel = null
  }
  if (data.state.phase === 'create' && data.me === null && phaseChanged) { entryMode = 'home'; scriptDetail = null; creatingRoom = false; accordionPanel = 'story' }
  if (!changed) {
    renderStage()
    renderHostOverview()
    for (const panel of document.querySelectorAll('.public-facts')) {
      if (panel.children[4]) panel.children[4].textContent = `计时　${state.remaining === null ? '当前不限时' : timeText()}`
    }
    renderNetworkStatus()
    return
  }
  const body = document.querySelector('#phone-body')
  const scroll = body.scrollTop
  const active = document.activeElement
  const inputId = active?.tagName === 'INPUT' ? active.id : null
  const draft = inputId ? active.value : null
  const accordionScroll = document.querySelector('.accordion-content')?.scrollTop || 0
  render()
  if (playerSceneOpen && endpoint === 'player' && ['join', 'ready'].includes(state.phase)) sceneView?.enterImmersive('portrait')
  body.scrollTop = phaseChanged ? 0 : scroll
  const expandedContent = document.querySelector('.accordion-content')
  if (expandedContent && !phaseChanged) expandedContent.scrollTop = accordionScroll
  if (inputId) {
    const input = document.getElementById(inputId)
    if (input) { input.value = draft; input.focus() }
  }
}
function renderNetworkStatus() {
  document.body.dataset.networked = "true"
  document.querySelector('.prototype-label').textContent = '本机交互原型'
  document.querySelector('#phone-connection').textContent = ''
}
function renderNetworkControls() {
  renderNetworkStatus()
  document.querySelector('#player-switch').hidden = true
  document.querySelector('.endpoint-tabs').hidden = !lan.localAdmin || !!testDevice
  document.querySelector('#demo-toggle').hidden = !lan.localAdmin || !!testDevice
  document.querySelector('#reset').hidden = !lan.localAdmin && lan.me !== state.roomOwner
  if (!lan.localAdmin || testDevice) document.querySelector('#demo-panel').hidden = true
  document.querySelector('.brand').href = testDevice ? `?endpoint=player&testDevice=${testDevice}` : '?endpoint=player'
  const entry = document.querySelector('.entry-code')
  if (lan.entryUrl && entry.dataset.entryUrl !== lan.entryUrl) {
    entry.dataset.entryUrl = lan.entryUrl
    entry.innerHTML = `<img class="lan-qr" src="${apiUrl('/api/qr?kind=entry&address=' + encodeURIComponent(lan.entryUrl))}" alt="手机游戏入口二维码"><p>手机扫码选本或加入房间</p><a href="${escaped(lan.entryUrl)}">${escaped(lan.entryUrl)}</a>`
  }
}
async function connectRoom() {
  try {
    const params = new URLSearchParams(location.search)
    const token = params.get('hostToken')
    const response = await fetch(apiUrl(`/api/session${token ? '?hostToken=' + encodeURIComponent(token) : ''}`))
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    acceptRoomSnapshot(data, true)
    if (token) { const url = new URL(location.href); url.searchParams.delete('hostToken'); history.replaceState(null, '', url) }
    lanEvents = new EventSource(apiUrl('/api/events'))
    lanEvents.onmessage = event => acceptRoomSnapshot(JSON.parse(event.data))
    lanEvents.onopen = () => { lan.connected = true; renderNetworkStatus() }
    lanEvents.onerror = () => { lan.connected = false; renderNetworkStatus() }
    if (params.get('room') && data.me === null) { entryMode = 'join'; render() }
  } catch (error) {
    lan.connected = false
    renderNetworkStatus()
    notify(error.message || '暂时无法连接电脑主机，正在重试。')
    setTimeout(connectRoom, 4000)
  }
}


function mountPlayerTests() {
  if (testDevice || document.querySelector('#owner-test-frame')) return
  const workspace = document.querySelector('#player-test-workspace')
  workspace.innerHTML = `<section class="test-device"><h2>房主手机</h2><p>扫码后选本、创建房间、邀请朋友。</p><iframe id="owner-test-frame" title="房主完整流程" src="?endpoint=player&testDevice=owner" allow="fullscreen; screen-orientation"></iframe></section><section class="test-device"><h2>被邀请玩家手机</h2><p>扫码后手动填写房间码，再选择角色入席。</p><iframe id="invited-test-frame" title="被邀请玩家完整流程" src="?endpoint=player&testDevice=invited" allow="fullscreen; screen-orientation"></iframe></section>`
}
async function sendTestAction(name, value = '') {
  try {
    const response = await fetch('/api/action?testDevice=owner', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, value, requestId: `test-action-${Date.now()}-${Math.random()}` }),
    })
    if (!response.ok) throw new Error((await response.json()).error)
  } catch (error) { notify(error.message) }
}
document.querySelector('#reset-test-room').addEventListener('click', () => {
  if (confirm('重置双玩家测试房间？')) sendTestAction('reset')
})
document.querySelector('.test-flow-helper').addEventListener('click', event => {
  const button = event.target.closest('[data-test-action]')
  if (button) sendTestAction(button.dataset.testAction, button.dataset.testValue || '')
})

async function copyRoomCode() {
  const text = String(state.roomCode || '')
  if (!text) return
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) await navigator.clipboard.writeText(text)
    else {
      const field = document.createElement('textarea')
      field.value = text
      field.style.cssText = 'position:fixed;left:0;top:0;opacity:0'
      document.body.appendChild(field)
      field.select()
      field.setSelectionRange(0,text.length)
      const copied = document.execCommand('copy')
      field.remove()
      if (!copied) throw new Error('请长按顶部房间码复制。')
    }
    notify('房间码已复制。')
  } catch (error) { notify('请长按顶部房间码复制。') }
}
