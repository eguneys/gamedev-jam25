import './style.css'
import { get_tile_for_world, Grid, is_solid_tile, levels, load_tileset, render_grid } from './grid'

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
  prev_x?: number
  prev_y?: number
  i_x: number
  i_y: number
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

function pos_xy(p: Position) {
  return [p.i_x + p.rem_x, p.i_y, + p.rem_y]
}

function position(x: number, y: number, w: number, h: number): Position {
  return {
    w,
    h,
    rem_x: 0,
    rem_y: 0,
    i_x: x,
    i_y: y,
    dx: 0,
    dy: 0,
    ddx: 0,
    ddy: 0,
    dy_pull: 0,
    is_grounded: false,
    facing: 0,
  }
}

type Player = Position & {
  ix: number
  iy: number
  jx: number
  jl: number
  jboost: number
  j_pp?: boolean
  ahead_x: number

  is_left: boolean
  is_right: boolean

  t_ledge: number
  t_knoll: number
}

function player(x: number, y: number) {
  return { ...position(x, y, 16, 16), 
    ix: 0, iy: 0, 
    jx: 0, jl: 0, 
    jboost: 0,
    ahead_x: 0,
    is_left: false,
    is_right: false,
    t_ledge: 0,
    t_knoll: 0
  }
}

type XYWH = [number, number, number, number]

function player_boxes(player: Player) {
  let [player_x, player_y] = pos_xy(player)

  let p_box: XYWH = [
    player_x,
    player_y,
    player.w,
    player.h
  ]

  let r_ledge_box: XYWH = [
    player_x + player.w / 2 + 4,
    player_y,
    8,
    16
  ]

  let l_ledge_box: XYWH = [
    player_x - 4,
    player_y,
    8,
    16
  ]
  let down_ledge_clear_box: XYWH = [
    player_x,
    player_y - 8,
    player.w,
    player.h + 8
  ]

  return {
    p_box,
    r_ledge_box,
    l_ledge_box,
    down_ledge_clear_box,
  }
}

const p_max_dx = 100

type HasCollidedXYWH = (x: number, y: number, w: number, h: number) => boolean | [number, number]

type Camera = { x: number, y: number }

type E1 = Position & {

}

type E2 = Position & {

}

function e1(x: number, y: number) {
  return {
    ...position(x, y, 32, 32)
  }
}

function e2(x: number, y: number) {
  return {
    ...position(x, y, 64, 64)
  }
}


function Play(cc: Canvas, ii: Input) {

  let p0 = player(0, 0)

  let e1s: E1[] = []
  let e2s: E2[] = []

  let [grid, entities] = levels()

  for (let entity of entities) {
    if (entity.src[0] === 136) {
      p0.i_x = entity.px[0]
      p0.i_y = entity.px[1]
    }
    if (entity.src[0] === 144) {

      e1s.push(e1(...entity.px))
    }
    if (entity.src[0] = 156) {
      e2s.push(e2(...entity.px))
    }
  }

  function has_collided_player(x: number, y: number, w: number, h: number) {
    return has_collided_grid(grid, x, y, w, h)
  }
  function has_collided_e1(x: number, y: number, w: number, h: number) {
    return has_collided_grid(grid, x, y, w, h)
  }

  function _update(delta: number) {


    for (let e1 of e1s) {
      update_e1(e1, delta, has_collided_e1)
    }

    update_player(ii, p0, delta, has_collided_player)

    update_camera(cc.camera, p0, delta)

    ii.update()
  }


  function _render(alpha: number) {
    cc.rect(0, 0, 320, 180, Color.Black)

    cc.rect(0, 162, 320, 8, Color.ForeBrown)
    cc.rect(0, 162, 320, 1, Color.ForeGreen)


    render_grid(cc, grid)

    for (let e1 of e1s) {
      render_e1(e1, alpha, cc)
    }

    for (let e2 of e2s) {
      render_e2(e2, alpha, cc)
    }

    render_player(p0, alpha, cc)
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

  let [player_x, player_y] = pos_xy(player)

  if (player_x - dead_x + player.ahead_x >= camera.x - 0.5) {
    camera.x = interpolate(player_x - dead_x + player.ahead_x, camera.x, 0.1)
  } else if (player_x + dead_x + player.ahead_x <= camera.x - 0.5) {
    camera.x = interpolate(player_x + dead_x + player.ahead_x, camera.x, 0.1)
  }

  let dead_y = 40

  if (player_y - dead_y > camera.y) {
    camera.y = interpolate(player_y - dead_y, camera.y, 0.1)
  } else if (player_y + dead_y < camera.y) {
    camera.y = interpolate(player_y + dead_y, camera.y, 0.1)
  }


}

function update_e1(e1: E1, delta: number, has_collided_e1: HasCollidedXYWH) {

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

    player.is_left = player.ix === -1
    player.is_right = player.ix === 1

    player.facing = player.hit_x ? Math.sign(player.hit_x) : Math.sign(player.dx)

    if (player.is_grounded) {
      player.jl = 1
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

    let { p_box, r_ledge_box, l_ledge_box, down_ledge_clear_box } = player_boxes(player)

    if (player.t_ledge === 0) {
      let d_ledge = has_collided_player(...down_ledge_clear_box)
      let r_ledge = has_collided_player(...r_ledge_box)
      let l_ledge = has_collided_player(...l_ledge_box)

      const ledge_cooldown = 180
      if (d_ledge === false) {
        if (player.is_right && Array.isArray(r_ledge)) {

          if (has_collided_player(r_ledge[0] - 8, r_ledge[1] - 16, p_box[2], p_box[3])) {

          } else {
            player.t_ledge = ledge_cooldown
            player.i_x = r_ledge[0] - 8
            player.i_y = r_ledge[1] - 8
          }
        } else if (player.is_left && Array.isArray(l_ledge)) {

          if (has_collided_player(l_ledge[0] - 8, l_ledge[1] - 16, p_box[2], p_box[3])) {

          } else {
            player.t_ledge = ledge_cooldown
            player.i_x = l_ledge[0]
            player.i_y = l_ledge[1] - 8
          }
        }
      }
    } else {

      player.t_ledge = appr(player.t_ledge, 0, delta)

      if (player.t_ledge === 0) {
        player.i_y = p_box[1] - 8
        player.dy = 0
      }
    }


    pixel_perfect_position_update(player, delta, has_collided_player)

}

function render_e1(e1: E1, alpha: number, cc: Canvas) {
    let x, y

    let [e1_x, e1_y] = pos_xy(e1)

    x = e1.prev_x ? interpolate(e1_x, e1.prev_x, alpha) : e1_x
    y = e1.prev_y ? interpolate(e1_y, e1.prev_y, alpha) : e1_y

    let facing = e1.facing

    if (facing === 0) {

    }
}
function render_e2(e2: E2, alpha: number, cc: Canvas) {
}

function render_player(player: Player, alpha: number, cc: Canvas) {
    let x, y

    let [player_x, player_y] = pos_xy(player)

    x = player.prev_x ? interpolate(player_x, player.prev_x, alpha) : player_x
    y = player.prev_y ? interpolate(player_y, player.prev_y, alpha) : player_y

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

    return
    let { r_ledge_box, l_ledge_box, down_ledge_clear_box } = player_boxes(player)
    render_box(cc, r_ledge_box, 'yellow')
    render_box(cc, l_ledge_box, 'yellow')
    render_box(cc, down_ledge_clear_box)
}

function render_box(cc: Canvas, xywh: XYWH, color = 'red') {
    cc.set_transform(xywh[0], xywh[1], 1, 1)
    cc.rect(0, 0, xywh[2], xywh[3], color)
    cc.reset_transform()
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
      if (is_solid_tile(grid, get_tile_for_world(grid, i, j))) {
        return [Math.floor(i / grid.tile_size) * grid.tile_size, Math.floor(j / grid.tile_size) * grid.tile_size] as [number, number]
      }
    }
  }

  return false
}

function pixel_perfect_position_update(pos: Position, delta: number, has_collided: HasCollidedXYWH) {

  let [pos_x, pos_y] = pos_xy(pos)
  pos.prev_x = pos_x
  pos.prev_y = pos_y

  let step_x = Math.sign(pos.dx)
  let tx = Math.abs(pos.dx * delta / 1000 + pos.rem_x)
  let sx = Math.floor(tx)

  pos.rem_x = (tx - sx) * Math.sign(pos.dx)

  pos.hit_x = has_collided(pos_x + step_x, pos_y, pos.w, pos.h) ? step_x : undefined

  for (let i = 0; i < sx; i++) {
    if (has_collided(pos.i_x + step_x, pos.i_y, pos.w, pos.h)) {
      pos.dx = 0
      pos.hit_x = step_x
      break
    }
    pos.i_x += step_x
  }

  let step_y = Math.sign(pos.dy)
  let ty = Math.abs(pos.dy * delta / 1000) + pos.rem_y
  let sy = Math.floor(ty)

  pos.rem_y = (ty - sy) * Math.sign(pos.dy)

  pos.is_grounded = has_collided(pos_x, pos_y + 1, pos.w, pos.h) !== false

  for (let i = 0; i < sy; i++) {
    if (has_collided(pos.i_x, pos.i_y + step_y, pos.w, pos.h)) {
      pos.is_grounded = step_y > 1
      pos.dy = 0
      break
    }
    pos.i_y += step_y
  }
}