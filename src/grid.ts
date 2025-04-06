import level0 from '../design/level0.ldtk?raw'
import png from '../design/tileset.png'
import { type Canvas } from './main'

let tile_img = new Image()

export function load_tileset() {
    tile_img.src = png
    return new Promise(resolve => {
        tile_img.onload = resolve
    })
}


type PxSrc = { px: [number, number], src: [number, number] }

type Tile = number

export type Grid = {
    x: number
    y: number
    w: number,
    h: number,
    tile_size: number
    tw: number
    th: number
    tiles: (Tile | undefined)[]
    tile_to_sources: Record<Tile, [number, number]>
}

function grid(x: number, y: number, w: number, h: number): Grid {
    let tile_size = 8
    return {
        x, y, w, h,
        tile_size,
        get tw() { return w / tile_size },
        get th() { return h / tile_size },
        tiles: [],
        tile_to_sources: {}
    }
}

function get_tile(grid: Grid, tx: number, ty: number) {
    return grid.tiles[tx + ty * grid.tw]
}

export function get_tile_for_world(grid: Grid, wx: number, wy: number) {
    let tx = Math.floor(wx / grid.tile_size)
    let ty = Math.floor(wy / grid.tile_size)
    return get_tile(grid, tx, ty)
}

function add_tile(grid: Grid, wx: number, wy: number, tile: Tile | undefined) {
    let tx = wx / grid.tile_size
    let ty = wy / grid.tile_size

    grid.tiles[tx + ty * grid.tw] = tile
}

function get_or_create_tile_for_src(grid: Grid, src: [number, number]) {
    let res = src[0] + src[1] * 1000
    grid.tile_to_sources[res] = src
    return res
}

function px_src_to_tile(px_src: PxSrc) {
    return {
        px: px_src.px,
        src: px_src.src
    }
}

export function is_solid_tile(_grid: Grid, tile?: Tile) {
    if (!tile) {
        return false
    }

    let [_x, y] = [tile % 1000, Math.floor(tile / 1000)]

    if (y > 100) {
        return false
    }

    return true
}

export function levels(nb_level = 1) {

    let l0 = JSON.parse(level0).levels[nb_level]
    let res = grid(l0.worldX, l0.worldY, l0.pxWid, l0.pxHei)

    let entities = []

    for (let px_src of l0.layerInstances[1].autoLayerTiles.map(px_src_to_tile)) {
        let tile = get_or_create_tile_for_src(res, px_src.src)

        if (px_src.src[1] > 100) {
            entities.push(px_src)
            continue
        }

        add_tile(res, px_src.px[0], px_src.px[1], tile)
    }

    return [res, entities] as [Grid, PxSrc[]]
}

export function render_grid(cc: Canvas, grid: Grid) {

    for (let tix = 0; tix < grid.tw; tix++) {
        for (let tiy = 0; tiy < grid.th; tiy++) {
            let tile = get_tile(grid, tix, tiy)
            if (!tile) {
                continue
            }
            let x= tix * grid.tile_size
            let y = tiy * grid.tile_size
            let [sx, sy] = grid.tile_to_sources[tile]

            cc.set_transform(x, y, 1, 1)
            cc.image(tile_img, 0, 0, sx, sy, 8, 8)
        }
    }
}