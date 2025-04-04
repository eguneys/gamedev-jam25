import './style.css'
import { get_tile_for_world, Grid, levels, load_tileset, render_grid } from './grid'

const Color = {
  Black: '#606c81',
  ForeBrown: '#1b1b1b',
  ForeGreen: '#8b8c8e',
  HeroOut1: '#3a7d79',
  HeroOut2: '#837996',
  HeroSecondary: '#dad7cd',
  HeroAccent: '#63c5da'
}

type Color = string

export type Canvas = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  image(image: CanvasImageSource, x: number, y: number, sx: number, sy: number, w: number, h: number): void
  rect(x: number, y: number, w: number, h: number, color: Color): void
  set_transform(x: number, y: number, sx: number, sy: number): void
  reset_transform(): void
  camera: Camera
}

export function Canvas(width: number, height: number): Canvas {

  let canvas = document.createElement('canvas')

  canvas.width = width
  canvas.height = height

  let ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false

  function rect(x: number, y: number, w: number, h: number, color = 'black') {
    ctx.fillStyle = color
    ctx.fillRect(x, y, w, h)
  }

  function image(image: CanvasImageSource, x: number, y: number, sx: number, sy: number, w: number, h: number) {
    ctx.drawImage(image, sx, sy, w, h, x, y, w, h)
  }

  let camera = { x: 0, y: 0 }

  return {
    canvas,
    ctx,
    camera,
    rect,
    image,
    set_transform(x: number, y: number, sx: number, sy: number) {
      x = Math.floor(x - (camera.x - width / 2))
      y = Math.floor(y - (camera.y - height / 2))
      let a = sx, b = 0, c = 0, d = sy, e = x, f = y
      ctx.setTransform(a, b, c, d, e, f)
    },
    reset_transform() {
      ctx.resetTransform()
    },
  }
}

function Loop(update: (dt: number) => void, render: (alpha: number) => void) {

  const timestep = 1000/60
  let last_time = performance.now()
  let accumulator = 0

  function step(current_time: number) {
    requestAnimationFrame(step)


    let delta_time = Math.min(current_time - last_time, 1000)
    last_time = current_time

    accumulator += delta_time

    while (accumulator >= timestep) {
      update(timestep)
      accumulator -= timestep
    }

    render(accumulator / timestep)
  }
  requestAnimationFrame(step)
}

type Action = 'left' | 'right' | 'jump'

type PressState = 'just' | boolean

type Input = {
  btn(action: Action): PressState
  btnp(action: Action): PressState
  update(): void
}

function Input() {

  let downs: Record<Action, PressState> = { left: false, right: false, jump: false }

  function on_down(action: Action) {
    downs[action] = 'just'
  }

  function on_up(action: Action) {
    downs[action] = false
  }

  function btn(action: Action) {
    return downs[action] !== false
  }

  function btnp(action: Action) {
    return downs[action] === 'just'
  }

  function update() {
    for (let key of Object.keys(downs)) {
      if (downs[key as Action] === 'just') {
        downs[key as Action] = true
      }
    }
  }

  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
        on_down('left')
        break
      case 'ArrowRight':
      case 'd':
        on_down('right')
        break
      case 'x':
      case 'i':
        on_down('jump')
        break
      default:
        return
    }
    e.preventDefault()
  })
  document.addEventListener('keyup', (e) => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
        on_up('left')
        break
      case 'ArrowRight':
      case 'd':
        on_up('right')
        break
      case 'x':
      case 'i':
        on_up('jump')
        break
      default:
        return
    }
    e.preventDefault()
  })

  return {
    btn,
    btnp,
    update
  }
}


function app(el: HTMLElement) {

  let cc = Canvas(320, 180)
  let ii = Input()

  let pp = Play(cc, ii)

  load_tileset()
  Loop(pp._update, pp._render)

  el.appendChild(cc.canvas)
}


app(document.getElementById('app')!)

type Position = {
  w: number,
  h: number,
  x: number
  y: number
  prev_x?: number
  prev_y?: number
  rem_x: number
  rem_y: number
  dx: number
  dy: number
  ddx: number
  ddy: number
  is_grounded: boolean
  hit_x?: number
  dy_pull: number
  facing: number
}

type Player = Position & {
  ix: number
  iy: number
  jx: number,
  jl: number
  jboost: number,
  j_pp?: boolean
  ahead_x: number
}

const p_max_dx = 100

type HasCollidedXYWH = (x: number, y: number, w: number, h: number) => boolean

type Camera = { x: number, y: number }

function Play(cc: Canvas, ii: Input) {

  let player: Player = { ahead_x: 0, jboost: 0, jl: 2, dy_pull: 0, is_grounded: false, w: 16, h: 16, rem_x: 0, rem_y: 0, x: 50, y: 100, dx: 0, dy: 0, ddx: 0, ddy: 0, ix: 0, iy: 0, facing: 0, jx: 0 }

  let grid = levels()

  function has_collided_player(x: number, y: number, w: number, h: number) {
    return has_collided_grid(grid, x, y, w, h)
  }

  function _update(delta: number) {

    update_player(ii, player, delta, has_collided_player)

    update_camera(cc.camera, player, delta)

    ii.update()
  }


  function _render(alpha: number) {
    cc.rect(0, 0, 320, 180, Color.Black)

    cc.rect(0, 162, 320, 8, Color.ForeBrown)
    cc.rect(0, 162, 320, 1, Color.ForeGreen)


    render_grid(cc, grid)

    render_player(player, alpha, cc)
  }



  return {
    _update,
    _render
  }
}

function update_camera(camera: Camera, player: Player, delta: number) {

  let dead_x = 70
  let look_x = dead_x * 1.77
  let look_dx = 0.09

  if (player.dx > 50) {
    player.ahead_x = appr(player.ahead_x, look_x, delta * look_dx)
  } else if (player.dx < -50) {
    player.ahead_x = appr(player.ahead_x, -look_x, delta * look_dx)
  } else {
    player.ahead_x = appr(player.ahead_x, 0, delta)
  }

  if (player.x - dead_x + player.ahead_x > camera.x) {
    camera.x = interpolate(player.x - dead_x + player.ahead_x, camera.x, 0.1)
  } else if (player.x + dead_x + player.ahead_x < camera.x) {
    camera.x = interpolate(player.x + dead_x + player.ahead_x, camera.x, 0.1)
  }

  let dead_y = 40

  if (player.y - dead_y > camera.y) {
    camera.y = interpolate(player.y - dead_y, camera.y, 0.1)
  } else if (player.y + dead_y < camera.y) {
    camera.y = interpolate(player.y + dead_y, camera.y, 0.1)
  }


}

function update_player(ii: Input, player: Player, delta: number, has_collided_player: HasCollidedXYWH) {
    if (ii.btn('jump')) {
      if (player.j_pp === undefined) {
        player.j_pp = false
      }
      player.jx = 230
    } else {
      player.jx = appr(player.jx, 0, delta)
      delete player.j_pp
    }


    if (ii.btn('left') && ii.btn('right')) {
      player.ix = 0
    } else if (ii.btn('left')) {
      player.ix = -1
    } else if (ii.btn('right')) {
      player.ix = 1
    } else {
      player.ix = 0
    }


    player.facing = player.hit_x ? Math.sign(player.hit_x) : Math.sign(player.dx)

    if (player.is_grounded) {
      player.jl = 2
    }

    const max_jump_boost = 400
    if (player.jx > 0) {
      if (player.j_pp === false) {
        if (player.jl > 0) {
          player.jl -= 1
          player.jboost = max_jump_boost
          player.j_pp = true
          player.dy = -player.jboost / max_jump_boost * 320
        }
      }
    }

    const max_ddy = 4
    if (player.j_pp === undefined) {
      player.jboost = 0
      player.ddy = max_ddy * 0.7
    }

    player.jboost = appr(player.jboost, 0, delta * player.ddy * 0.7)

    if (player.jboost > 0) {
      player.ddy = appr(player.ddy, max_ddy, delta)
      player.dy_pull = 0

      player.dy = appr(player.dy, player.dy_pull, delta * player.ddy * 0.1)
    } else {
      player.dy_pull = appr(player.dy_pull, 300, delta * 100)
      player.dy = appr(player.dy, player.dy_pull, delta * player.ddy)
    }

    if (player.ix !== 0) {
      if (player.dx !== 0 && Math.sign(player.ix) !== Math.sign(player.dx)) {
        player.ddx = 100
        player.dx = appr(player.dx, 0, delta * player.ddx)
      } else {
        player.dx = appr(player.dx, (p_max_dx + player.jboost / max_jump_boost * 100) * player.ix, delta * player.ddx)
      }
    } else {
      player.dx = appr(player.dx, 0, delta * player.ddx)
    }

    player.ddx = appr(player.ddx, 1, delta)
    player.ddy = appr(player.ddy, 1, delta * 0.03)

    pixel_perfect_position_update(player, delta, has_collided_player)



}

function render_player(player: Player, alpha: number, cc: Canvas) {
    let x, y

    x = player.prev_x ? interpolate(player.x, player.prev_x, alpha) : player.x
    y = player.prev_y ? interpolate(player.y, player.prev_y, alpha) : player.y

    let facing = player.facing

    if (facing === 0) {
      cc.set_transform(x, y, 1, 1)
      cc.rect(0, 0, 16, 16, Color.HeroOut1)
      cc.rect(0, 0, 16, 3, Color.HeroSecondary)
      cc.rect(2, 2 + 2, 2, 4, Color.HeroAccent)
      cc.rect(0 + 16 - 4, 0 + 4, 2, 4, Color.HeroAccent)
      cc.reset_transform()
    } else {
      if (facing === -1) {
        x += 16
      }
      cc.set_transform(x, y, facing, 1)
      cc.rect(0, 0, 16, 16, Color.HeroOut1)
      cc.rect(0, 0, 6, 6, Color.HeroSecondary)
      cc.rect(0 + 14, 0 + 2, 2, 4, Color.HeroAccent)
      cc.reset_transform()
    }


    //cc.rect(player.x, player.y, player.w, player.h, 'red')
}


function interpolate(x: number, prev: number, alpha: number) {
  return prev + (x - prev) * alpha
}

function appr(value: number, target: number, by: number) {
  if (value < target) {
    return Math.min(value + by, target)
  } else if (value > target) {
    return Math.max(value - by, target)
  } else {
    return target
  }
}

function has_collided_grid(grid: Grid, x: number, y: number, w: number, h: number) {

  if (x < 0 || x + w > grid.w) {
    return true
  }

  if (y < 0 || y + h > grid.h) {
    return true
  }

  for (let i = x; i < x + w; i++) {
    for (let j = y; j < y + h; j++) {
      if (get_tile_for_world(grid, i, j) !== undefined) {
        return true
      }
    }
  }

  return false
}

function pixel_perfect_position_update(pos: Position, delta: number, has_collided: (x: number, y: number, w: number, h: number) => boolean) {

  pos.prev_x = pos.x
  pos.prev_y = pos.y

  let step_x = Math.sign(pos.dx)
  let tx = Math.abs(pos.dx * delta / 1000 + pos.rem_x)
  let sx = Math.floor(tx)

  pos.rem_x = (tx - sx) * Math.sign(pos.dx)

  pos.hit_x = has_collided(pos.x + step_x, pos.y, pos.w, pos.h) ? step_x : undefined

  for (let i = 0; i < sx; i++) {
    if (has_collided(pos.x + step_x, pos.y, pos.w, pos.h)) {
      pos.dx = 0
      pos.hit_x = step_x
      break
    }
    pos.x += step_x
  }

  let step_y = Math.sign(pos.dy)
  let ty = Math.abs(pos.dy * delta / 1000) + pos.rem_y
  let sy = Math.floor(ty)

  pos.rem_y = (ty - sy) * Math.sign(pos.dy)

  pos.is_grounded = has_collided(pos.x, pos.y + 1, pos.w, pos.h)

  for (let i = 0; i < sy; i++) {
    if (has_collided(pos.x, pos.y + step_y, pos.w, pos.h)) {
      pos.is_grounded = true
      pos.ddy = 0
      pos.dy = 0
      break
    }
    pos.y += step_y
  }
}