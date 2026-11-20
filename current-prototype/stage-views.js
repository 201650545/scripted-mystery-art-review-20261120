import * as THREE from '../舞台原型/node_modules/three/build/three.module.js'

export function createStageViews({ camera, renderer, container, dolls, getPlayer, getRole, notify }) {
  const theatre = container.closest('.theatre')
  const canvas = renderer.domElement
  const buttons = [...theatre.querySelectorAll('[data-view]')]
  const orientationButton = theatre.querySelector('[data-view="orientation"]')
  const cameraButtons = [...theatre.querySelectorAll('[data-view="first"], [data-view="god"]')]
  const seatControl = document.querySelector('#seat-control')
  const seatSelect = document.querySelector('#view-seat')
  const exitButton = document.querySelector('#exit-immersive')
  const resetButton = document.querySelector('#reset-view')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const direction = new THREE.Vector3()
  const position = new THREE.Vector3()
  const target = new THREE.Vector3()
  const lookTarget = new THREE.Vector3(0, .8, 0)
  const spherical = new THREE.Spherical()
  const up = new THREE.Vector3(0, 1, 0)
  const pointers = new Map()
  let mode = 'god'
  let immersiveOrientation = null
  let immersive = false
  let nativeFullscreen = false
  let fullscreenPending = false
  let yaw = 0
  let pitch = 0
  let zoom = 1
  let seat = getRole()
  let currentPlayer = getPlayer()
  let currentRole = getRole()
  let dragDistance = 0
  let pinchDistance = null
  let multiTouch = false
  let controlsTimer

  function refreshControls() {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)))
    if (orientationButton) {
      orientationButton.textContent = immersiveOrientation === 'portrait' ? '↔' : '↕'
      orientationButton.setAttribute('aria-label', immersiveOrientation === 'portrait' ? '横屏入席' : '竖屏入席')
      orientationButton.title = orientationButton.getAttribute('aria-label')
    }
    cameraButtons.forEach(button => {
      button.hidden = !immersive
      button.textContent = button.dataset.view === 'first' ? '◉' : '⊙'
      button.setAttribute('aria-label', button.dataset.view === 'first' ? '第一人称' : '上帝视角')
      button.title = button.getAttribute('aria-label')
    })
    seatControl.hidden = mode !== 'first'
    seatSelect.value = String(seat)
    // 方向切换只保留工具坞中的一个按钮，避免与旧的退出按钮重复。
    exitButton.hidden = true
    theatre.dataset.cameraMode = mode
    theatre.dataset.immersive = String(immersive)
    canvas.setAttribute('aria-label', mode === 'first' ? `${seatSelect.selectedOptions[0].textContent}座位的第一人称舞台，可拖动环视` : '五人木偶剧场，可拖动环视和缩放')
  }

  function showControls() {
    clearTimeout(controlsTimer)
    theatre.classList.remove('controls-hidden')
    if (immersive) controlsTimer = setTimeout(() => {
      theatre.querySelectorAll('.stage-dock').forEach(dock => {
        if (dock.contains(document.activeElement)) document.activeElement.blur()
      })
      theatre.classList.add('controls-hidden')
      theatre.dispatchEvent(new CustomEvent('stage-idle'))
    }, 60 * 1000)
  }

  function resetView() {
    yaw = 0
    pitch = 0
    zoom = 1
    showControls()
  }

  function setMode(nextMode) {
    mode = nextMode
    resetView()
    refreshControls()
  }

  function setImmersive(enabled, orientation = null) {
    immersive = enabled
    immersiveOrientation = enabled ? orientation : null
    document.body.classList.toggle('stage-immersive', enabled)
    theatre.dataset.immersiveOrientation = enabled ? orientation : ''
    if (!enabled) {
      clearTimeout(controlsTimer)
      theatre.classList.remove('controls-hidden')
    }
    refreshControls()
    if (enabled) showControls()
  }

  async function enterImmersive(orientation = 'landscape') {
    setMode('first')
    setImmersive(true, orientation)
    // 玩家进入房间的默认状态是手机竖屏舞台。竖屏不请求原生全屏，
    // 避免部分移动浏览器把全屏手势解释成横屏布局。
    if (orientation === 'portrait') {
      fullscreenPending = false
      return
    }
    if (fullscreenPending) return
    fullscreenPending = true
    try {
      if (theatre.requestFullscreen && document.fullscreenElement !== theatre) {
        await theatre.requestFullscreen()
        nativeFullscreen = document.fullscreenElement === theatre
      }
      if (!immersive) {
        if (document.fullscreenElement === theatre) await document.exitFullscreen()
        return
      }
      if (orientation === 'landscape' && nativeFullscreen && screen.orientation?.lock) {
        try { await screen.orientation.lock('landscape') }
        catch { if (innerHeight > innerWidth) notify('请将手机横放，页面会自动适配。') }
      } else if (orientation === 'landscape' && innerHeight > innerWidth) notify('请将手机横放，页面会自动适配。')
    } catch {
      if (immersive) notify('已进入页面沉浸模式，手机可横放查看。')
    } finally {
      fullscreenPending = false
    }
  }

  async function exitImmersive() {
    setImmersive(false)
    screen.orientation?.unlock?.()
    if (document.fullscreenElement === theatre) {
      try { await document.exitFullscreen() }
      catch { notify('可按 Esc 退出浏览器全屏。') }
    }
    nativeFullscreen = false
    setMode('god')
  }

  function handleFullscreenChange() {
    if (document.fullscreenElement === theatre) nativeFullscreen = true
    else if (nativeFullscreen) {
      nativeFullscreen = false
      screen.orientation?.unlock?.()
      setImmersive(false)
      setMode('god')
    }
  }

  function syncPhysicalOrientation() {
    if (!immersive) return
    // 竖屏入席由入口明确指定，保持手机构图，不能被 viewport 的瞬时变化改成横屏。
    if (immersiveOrientation === 'portrait') return
    const orientation = screen.orientation?.type
      ? screen.orientation.type.startsWith('landscape') ? 'landscape' : 'portrait'
      : innerWidth > innerHeight ? 'landscape' : 'portrait'
    if (orientation === immersiveOrientation) return
    immersiveOrientation = orientation
    theatre.dataset.immersiveOrientation = orientation
    if (orientation === 'portrait' && mode !== 'portrait') setMode('portrait')
    else if (orientation === 'landscape' && mode === 'portrait') setMode('first')
    refreshControls()
  }

  function handleKey(event) {
    if (event.key === 'Escape' && immersive) exitImmersive()
    if (event.target !== canvas) return
    if (event.key === 'ArrowLeft') yaw += .12
    else if (event.key === 'ArrowRight') yaw -= .12
    else if (event.key === 'ArrowUp') pitch += .08
    else if (event.key === 'ArrowDown') pitch -= .08
    else return
    pitch = THREE.MathUtils.clamp(pitch, -.65, .65)
    event.preventDefault()
  }

  function handleViewClick(event) {
    const button = event.target.closest('[data-view]')
    if (!button) return
    if (button.dataset.view === 'orientation') enterImmersive(immersiveOrientation === 'portrait' ? 'landscape' : 'portrait')
    else setMode(button.dataset.view)
  }

  function handleOrientationButton() {
    enterImmersive(immersiveOrientation === 'portrait' ? 'landscape' : 'portrait')
  }

  function handleSeatChange() {
    seat = Number(seatSelect.value)
    resetView()
    refreshControls()
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    canvas.setPointerCapture(event.pointerId)
    if (pointers.size === 0) { dragDistance = 0; multiTouch = false }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size > 1) multiTouch = true
    pinchDistance = null
  }

  function handlePointerMove(event) {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    dragDistance += Math.abs(dx) + Math.abs(dy)
    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()]
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      // 双指向外张开时缩小视野，双指向内收拢时扩大视野。
      if (pinchDistance !== null && distance > 0) zoom = THREE.MathUtils.clamp(zoom * pinchDistance / distance, 1, 1.5)
      pinchDistance = distance
      return
    }
    yaw -= dx * .005
    pitch = THREE.MathUtils.clamp(pitch + dy * .004, -.65, .65)
  }

  function handlePointerEnd(event) {
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    pinchDistance = null
    if (immersive && pointers.size === 0 && dragDistance < 8 && !multiTouch && event.type === 'pointerup') showControls()
  }

  function handleWheel(event) {
    event.preventDefault()
    zoom = THREE.MathUtils.clamp(zoom * Math.exp(-event.deltaY * .001), 1, 1.5)
  }

  function update(delta) {
    if (currentPlayer !== getPlayer() || currentRole !== getRole()) {
      currentPlayer = getPlayer()
      currentRole = getRole()
      seat = currentRole
      resetView()
      refreshControls()
    }
    const firstPersonMode = ['first', 'landscape'].includes(mode)
    dolls.forEach((item, index) => { item.doll.visible = !firstPersonMode || index !== seat })
    if (firstPersonMode) {
      position.copy(dolls[seat].seat.position).add(new THREE.Vector3(0, 1.87, 0))
      direction.set(-position.x, 1.48 - position.y, -position.z).normalize()
      spherical.setFromVector3(direction)
      spherical.theta += yaw
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - pitch, .18, Math.PI - .18)
      direction.setFromSpherical(spherical)
      target.copy(position).addScaledVector(direction, 4)
    } else {
      // 竖屏入席为手机构图，桌面需要略向上留出底部常驻工具区。
      target.set(0, mode === 'portrait' ? .38 : .8, 0)
      direction.copy(mode === 'portrait' ? new THREE.Vector3(0, 7.8, 12.4) : mode === 'god' ? new THREE.Vector3(0, 10.4, 11.2) : new THREE.Vector3(0, 3.6, 10.8))
      spherical.setFromVector3(direction)
      spherical.theta += yaw
      spherical.phi = THREE.MathUtils.clamp(spherical.phi - pitch, .12, 1.35)
      // 视野比例越高，可见范围越大。相机向后退，避免把 150% 做成拉近镜头。
      spherical.radius *= Math.max(1, .95 / camera.aspect) * zoom
      position.copy(target).add(direction.setFromSpherical(spherical))
    }
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-Math.max(delta, .001) * 8)
    camera.position.lerp(position, blend)
    lookTarget.lerp(target, blend)
    camera.up.copy(up)
    camera.lookAt(lookTarget)
    // 第一人称通过增大视场角扩大视野，100% 为默认视野。
    const desiredFov = firstPersonMode ? THREE.MathUtils.clamp(72 * zoom, 72, 108) : 43
    camera.fov = THREE.MathUtils.lerp(camera.fov, desiredFov, blend)
    camera.near = firstPersonMode ? .035 : .1
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }

  canvas.tabIndex = 0
  theatre.addEventListener('click', handleViewClick)
  theatre.addEventListener('click', () => { if (immersive) showControls() })
  seatSelect.addEventListener('change', handleSeatChange)
  resetButton.addEventListener('click', resetView)
  exitButton.addEventListener('click', handleOrientationButton)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  screen.orientation?.addEventListener?.('change', syncPhysicalOrientation)
  window.addEventListener('orientationchange', syncPhysicalOrientation)
  document.addEventListener('keydown', handleKey)
  canvas.addEventListener('pointerdown', handlePointerDown)
  canvas.addEventListener('pointerdown', () => { if (immersive) showControls() })
  canvas.addEventListener('pointermove', handlePointerMove)
  canvas.addEventListener('pointerup', handlePointerEnd)
  canvas.addEventListener('pointercancel', handlePointerEnd)
  canvas.addEventListener('lostpointercapture', handlePointerEnd)
  canvas.addEventListener('wheel', handleWheel, { passive: false })
  refreshControls()

  window.stageViewSnapshot = () => ({
    mode, immersive, immersiveOrientation, seat, yaw, pitch, zoom,
    position: camera.position.toArray(),
    target: lookTarget.toArray(),
    seatPosition: dolls[seat].seat.position.toArray(),
    visiblePuppets: dolls.map(item => item.doll.visible),
    aspect: camera.aspect,
  })

  function dispose() {
    clearTimeout(controlsTimer)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    screen.orientation?.removeEventListener?.('change', syncPhysicalOrientation)
    window.removeEventListener('orientationchange', syncPhysicalOrientation)
    document.removeEventListener('keydown', handleKey)
    delete window.stageViewSnapshot
  }

  return { update, dispose, setMode, enterImmersive, exitImmersive }
}
