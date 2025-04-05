import './style.css'
import { get_tile_for_world, Grid, is_solid_tile, levels, load_tileset, render_grid } from './grid'
import spritesheet_png from './assets/spritesheet.png'
import bg_png from './assets/bg.png'
import city_png from './assets/city.png'

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

let sheet = new Image()
let bg_image = new Image()
let city_image = new Image()

function load_image(sheet: HTMLImageElement, src: string) {
  return new Promise(resolve => {
    sheet.onload = resolve
    sheet.src = src
  })
}

function app(el: HTMLElement) {

  let cc = Canvas(320, 180)
  let ii = Input()

  let pp = Play(cc, ii)

  Promise.all([
    load_tileset(),
    load_image(sheet, spritesheet_png),
    load_image(bg_image, bg_png),
    load_image(city_image, city_png)
  ])

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
function pos_xy_center(p: Position) {
  let [x, y] = pos_xy(p)

  return [x + p.w / 2, y + p.h / 2]
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

  knock_box?: E2
  t_knock: number
  t_knock_cool: number
  flash_skip: boolean

  anim: Anim
}


function player(x: number, y: number): Player {
  return { ...position(x, y, 16, 16), 
    anim: anim(0, 136, 32, 32, ['idle', 'run', 'fall', 'ledge']),
    ix: 0, iy: 0, 
    jx: 0, jl: 0, 
    jboost: 0,
    ahead_x: 0,
    is_left: false,
    is_right: false,
    t_ledge: 0,
    t_knoll: 0,
    t_knock: 0,
    t_knock_cool: 0,
    flash_skip: false
  }
}

type XYWH = [number, number, number, number]

function player_boxes(player: Player) {
  let [player_x, player_y] = pos_xy(player)

  let p_box: XYWH = [
    player_x + 2,
    player_y + 2,
    player.w - 2,
    player.h - 2
  ]

  let r_ledge_box: XYWH = [
    p_box[0] + p_box[2] / 2 + 6,
    p_box[1],
    p_box[2] / 2,
    p_box[3]
  ]

  let l_ledge_box: XYWH = [
    p_box[0] - 4,
    p_box[1],
    p_box[2] / 2,
    p_box[3]
  ]
  let down_ledge_clear_box: XYWH = [
    p_box[0],
    p_box[1] - 4,
    player.w,
    player.h + 4
  ]

  return {
    p_box,
    r_ledge_box,
    l_ledge_box,
    down_ledge_clear_box,
  }
}

function e1_boxes(c: E1) {
  let [c_x, c_y] = pos_xy(c)

  let c_box: XYWH = [
    c_x,
    c_y,
    c.w,
    c.h
  ]


  let eye_left_box: XYWH = [
    c_x - c.w * 3.2,
    c_y,
    c.w * 3,
    c.h
  ]

  let eye_right_box: XYWH = [
    c_x + c.w * 1.2,
    c_y,
    c.w * 3,
    c.h
  ]

  let eye_up_box: XYWH = [
    c_x,
    c_y - c.h * 1.4, 
    c.w,
    c.h * 1.4 
  ]

  return {
    c_box,
    eye_left_box,
    eye_right_box,
    eye_up_box
  }
}


const p_max_dx = 100

type HasCollidedXYWH = (x: number, y: number, w: number, h: number) => boolean | [number, number]

type Camera = { x: number, y: number }

type E1 = Position & {
  anim: Anim

}

type E2 = Position & {
  anim: Anim

}

function e1(x: number, y: number): E1 {
  return {
    ...position(x, y - 32, 32, 32),
    anim: anim(0, 0, 32, 32)
  }
}

function e2(x: number, y: number): E2 {
  return {
    ...position(x, y - 24, 32, 32),
    anim: anim(0, 0, 32, 32)
  }
}
function anim(x: number, y: number, w: number, h: number, y_frames = ['idle'], nb_frames = 3): Anim {
  return {
    x, y,
    w, h,
    i: 0,
    t_frame: 0,
    duration: 111,
    nb_frames,
    y_frames,
    y_frame: y_frames[0]
  }
}

type BG = {
  clouds_x: number
  city_x: number
}

function Play(cc: Canvas, ii: Input) {

  let bg: BG = {
    clouds_x: 0,
    city_x: 0
  }

  let p0 = player(0, 0)

  let e1s: E1[] = []
  let e2s: E2[] = []

  let [grid, entities] = levels()

  for (let entity of entities) {
    if (entity.src[0] === 136) {
      p0.i_x = entity.px[0]
      p0.i_y = entity.px[1]
    }
    if (entity.src[0] === 152) {
      e1s.push(e1(...entity.px))
    }
    if (entity.src[0] === 144) {
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

    update_bg(grid, bg, cc.camera, delta)

    let { p_box } = player_boxes(p0)

    for (let e1 of e1s) {
      update_e1(e1, delta, has_collided_e1)

    }
    for (let e2 of e2s) {
      update_e2(e2, delta, has_collided_e1)

      let { c_box } = e1_boxes(e2)

      if (p0.knock_box === undefined) {
        if (box_intersect(c_box, p_box)) {
          p0.knock_box = e2
        }
      }
    }

    update_player(ii, p0, delta, has_collided_player)

    update_camera(grid, cc.camera, p0, delta)

    ii.update()
  }


  function _render(alpha: number) {
    cc.rect(0, 0, 320, 180, Color.Black)


    render_bg(cc, bg)

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

function update_bg(grid: Grid, bg: BG, camera: Camera, delta: number) {

  let bg_factor = grid.w / (bg_image.width * 30)
  bg.clouds_x = appr(bg.clouds_x, -(camera.x - 320 / 2) * bg_factor, delta)

  let city_factor = grid.w / (city_image.width * 10)
  bg.city_x = appr(bg.city_x, -(camera.x - 320 / 2) * city_factor, delta)
}

function render_bg(cc: Canvas, bg: BG) {
  cc.set_transform(bg.clouds_x, 0, 1, 1)
  cc.image(bg_image, 0, 0, 0, 0, bg_image.width, bg_image.height)
  cc.image(bg_image, bg_image.width, 0, 0, 0, bg_image.width, bg_image.height)
  cc.reset_transform()

  cc.set_transform(bg.city_x, 0, 1, 1)
  cc.image(city_image, 0, 0, 0, 0, city_image.width, city_image.height)
  cc.image(city_image, city_image.width, 0, 0, 0, city_image.width, city_image.height)
  cc.reset_transform()
}

function update_camera(grid: Grid, camera: Camera, player: Player, delta: number) {

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


  camera.x = Math.min(Math.max(320 / 2, camera.x), grid.w - 320 / 2)
  camera.y = Math.min(Math.max(180 / 2, camera.y), grid.h - 180 / 2)
}

function update_anim(anim: Anim, delta: number) {

  anim.t_frame = appr(anim.t_frame, 0, delta)

  if (anim.t_frame === 0) {
    anim.t_frame = anim.duration
    anim.i = anim.i + 1
    if (anim.i >= anim.nb_frames) {
      anim.i = 0
    }
  }
}

function update_e2(e2: E2, delta: number, _has_collided_e2: HasCollidedXYWH) {
  update_anim(e2.anim, delta)
}


function update_e1(e1: E1, delta: number, _has_collided_e1: HasCollidedXYWH) {
  update_anim(e1.anim, delta)
}

const ledge_cooldown = 380
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

    if (player.t_knock > 0) {
      player.ix = 0
    }

    player.is_left = player.ix === -1
    player.is_right = player.ix === 1

    if (player.hit_x !== undefined && player.hit_x !== 0) {
      player.facing = Math.sign(player.hit_x)
    } else if (player.dx !== 0) {
      player.facing = Math.sign(player.dx)
    }

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

      if (d_ledge === false) {
        if (player.is_right && Array.isArray(r_ledge)) {

          if (has_collided_player(r_ledge[0] - 8, r_ledge[1] - 16, p_box[2], p_box[3])) {

          } else {
            player.t_ledge = ledge_cooldown
            player.i_x = r_ledge[0] - 8
            player.i_y = r_ledge[1] - 8
          }
        } else if (player.is_left && Array.isArray(l_ledge)) {

          if (has_collided_player(l_ledge[0], l_ledge[1] - 16, p_box[2], p_box[3])) {

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
        player.i_y = p_box[1] - p_box[3]
        player.dy = 0
      }
    }

    if (player.t_knock_cool > 0) {
      player.t_knock_cool = appr(player.t_knock_cool, 0, delta)
      if (player.t_knock_cool === 0) {

        player.knock_box = undefined
      }
    }

    if (player.knock_box) {
      if (player.t_knock_cool > 0) {

      } else if (player.t_knock > 0) {
        player.t_knock = appr(player.t_knock, 0, delta)
        if (player.t_knock === 0) {
          player.t_knock_cool = 1200
        }
      } else {
        player.t_knock = 500
        let [b_x, b_y] = pos_xy_center(player.knock_box)
        let [p_x, p_y] = pos_xy_center(player)

        let [d_x, d_y] = [p_x - b_x, p_y - b_y]

        let s_x = Math.sign(d_x)
        let s_y = Math.sign(d_y)

        if (s_x === 0) {
          s_x = -1
        }
        if (s_y === 0) {
          s_y = -1
        }

        let a_x = Math.max(11, Math.min(Math.abs(d_x), 16))
        let a_y = Math.max(16, Math.min(Math.abs(d_y), 26))

        player.dx = s_x * a_x * 18
        player.dy = a_y * -22
      }
    }

  player.flash_skip = false
  if (player.t_knock > 0) {
    if (player.t_knock % 200 < 100) {
      player.flash_skip = true
    }
  }
  if (player.t_knock_cool > 0) {
    if (player.t_knock_cool % 300 < 160) {
      player.flash_skip = true
    }
  }

    pixel_perfect_position_update(player, delta, has_collided_player)


    player.anim.duration = 100
    if (player.ix !== 0) {
      player.anim.y_frame = 'run'
    } else {
      player.anim.y_frame = 'idle'
    }

    if (!player.is_grounded && player.dy !== 0) {
      player.anim.y_frame = 'fall'
    }
    if (player.t_ledge !== 0) {
      player.anim.y_frame = 'ledge'
      player.anim.duration = ledge_cooldown / 3
    }

    update_anim(player.anim, delta)
}

function render_e1(_e1: E1, _alpha: number, _cc: Canvas) {
}

function render_e2(e2: E2, alpha: number, cc: Canvas) {
  let x, y

  let [e2_x, e2_y] = pos_xy(e2)

  x = e2.prev_x ? interpolate(e2_x, e2.prev_x, alpha) : e2_x
  y = e2.prev_y ? interpolate(e2_y, e2.prev_y, alpha) : e2_y

  render_anim(cc, e2.anim, e2.facing, x, y)


    let { 
      eye_right_box, 
      eye_left_box ,
      eye_up_box,
      c_box
    } = e1_boxes(e2)

    let [cx, cy] = pos_xy_center(e2)

    if (false) {
      cc.set_transform(cx, cy, 1, 1)
      cc.rect(0, 0, 2, 2, 'blue')
      cc.reset_transform()
    }

    if (false) {
      render_box(cc, c_box)
    }

    if (false) {
      render_box(cc, eye_left_box)
      render_box(cc, eye_right_box)
      render_box(cc, eye_up_box)
    }
}

type Anim = {
  x: number
  y: number
  w: number
  h: number
  i: number
  t_frame: number
  duration: number
  nb_frames: number
  y_frames: string[]
  y_frame: string
}
function render_anim(cc: Canvas, anim: Anim, facing: number, x: number, y: number) {
  let iy = anim.y_frames.indexOf(anim.y_frame)
  let sx = anim.x + anim.w * anim.i
  let sy = anim.y + iy * anim.h
  
  if (facing === 0) {
    cc.set_transform(x, y, 1, 1)
  } else {
    if (facing === -1) {
      x += anim.w
    }
    cc.set_transform(x, y, facing, 1)
  }
  cc.image(sheet, 0, 0, sx, sy, anim.w, anim.h)
  cc.reset_transform()
}

function render_player(player: Player, alpha: number, cc: Canvas) {
  if (player.flash_skip) {
    return
  }

    let x, y

    let [player_x, player_y] = pos_xy(player)

    x = player.prev_x ? interpolate(player_x, player.prev_x, alpha) : player_x
    y = player.prev_y ? interpolate(player_y, player.prev_y, alpha) : player_y

  let facing = player.facing
  render_anim(cc, player.anim, facing, x - 8, y - 16)


    let { p_box, r_ledge_box, l_ledge_box, down_ledge_clear_box } = player_boxes(player)
    if (false) {
      render_box(cc, r_ledge_box, 'yellow')
      render_box(cc, l_ledge_box, 'yellow')
      render_box(cc, down_ledge_clear_box)
    }
    if (false) {
      render_box(cc, p_box)
    }


    let [cx, cy] = pos_xy_center(player)

    if (false) {
      cc.set_transform(cx, cy, 1, 1)
      cc.rect(0, 0, 10, 10, 'blue')
      cc.reset_transform()
    }


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


function box_intersect(a: XYWH, b: XYWH) {
  let [a_x, a_y, a_width, a_height] = a
  let [b_x, b_y, b_width, b_height] = b

  return !(
    a_x + a_width <= b_x ||
    a_x >= b_x + b_width ||
    a_y + a_height <= b_y ||
    a_y >= b_y + b_height
  );
}