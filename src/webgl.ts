export type GL = {
    clear(): void
    draw(): void
    add_program(vs: string, fs: string): void
    canvas: HTMLCanvasElement
}

export function GL(width: number, height: number) {

    let canvas = document.createElement('canvas')

    let gl = canvas.getContext('webgl2', { antialias: false })!

    type Pid = string
    type DrawData = { x: number, y: number, w: number, h: number }

    let programs: Record<Pid, { program: WebGLProgram } & DrawVAO> = {}
    let dd_els: Record<Pid, DrawData[]> = {}

    let pi = 0
    const gen_pid = () => pi++

    once(gl, width, height)

    function add_program(vs: string, fs: string) {
        let pid = gen_pid()
        let program = createProgram(gl, vs, fs)

        let vao = createVAO(gl, program)
        

        programs[pid] = { program, ...vao }
    }

    function draw() {

        for (let pid of Object.keys(dd_els)) {
            let { program, drawVAO } = programs[pid]
            let els = dd_els[pid]

            let nb = els.length
            let i_buff_data = new Uint16Array(nb * 6)
            let a_buff_data = new Float32Array(nb * 5 * 4)


            let a_index = 0
            let i_index = 0

            gl.useProgram(program)

            for (let i = 0; i < els.length; i++) {

                let {x, y, w, h} = els[i]

                a_buff_data[a_index++] = x
                a_buff_data[a_index++] = y
                a_buff_data[a_index++] = 0
                a_buff_data[a_index++] = 0

                a_buff_data[a_index++] = x + w
                a_buff_data[a_index++] = y
                a_buff_data[a_index++] = 0
                a_buff_data[a_index++] = 0

                a_buff_data[a_index++] = x
                a_buff_data[a_index++] = y + h           
                a_buff_data[a_index++] = 0
                a_buff_data[a_index++] = 0

                a_buff_data[a_index++] = x + w
                a_buff_data[a_index++] = y + h
                a_buff_data[a_index++] = 0
                a_buff_data[a_index++] = 0


                i_buff_data[i_index++] = i * 4 + 0
                i_buff_data[i_index++] = i * 4 + 1
                i_buff_data[i_index++] = i * 4 + 2
                i_buff_data[i_index++] = i * 4 + 1
                i_buff_data[i_index++] = i * 4 + 2
                i_buff_data[i_index++] = i * 4 + 3
            }

            drawVAO(a_buff_data, i_buff_data, els.length)
        }

    }

    function clear() {
            gl.clear(gl.COLOR_BUFFER_BIT)
    }

    return {
        clear,
        draw,
        add_program,
        canvas,
    }

}

export function once(gl: WebGL2RenderingContext, width: number, height: number) {
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 1)
   // this.gl.enable(this.gl.DEPTH_TEST)
   // this.gl.enable(this.gl.BLEND)
   // this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA)
   // /* https://stackoverflow.com/questions/9057401/why-is-gl-lequal-recommended-for-the-gl-depth-function-and-why-doesnt-it-work */
   // this.gl.depthFunc(this.gl.LEQUAL)
}

export function createTexture(gl: WebGL2RenderingContext, source: TexImageSource) {
    let texture = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture
}


type DrawVAO = {
    drawVAO(a_buff: Float32Array, i_buff: Uint16Array, nb: number): void
}

const MAX_NB = 100
export function createVAO(gl: WebGL2RenderingContext, program: WebGLProgram): DrawVAO {
    let vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)


    let a_buff = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, a_buff)
    gl.bufferData(gl.ARRAY_BUFFER, MAX_NB * 4 * 4 * 4, gl.DYNAMIC_DRAW)


    let i_buff = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, i_buff)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, MAX_NB * 6 * 4, gl.DYNAMIC_DRAW)

    let stride = 2 * 4 + 2 * 4

    let a_pos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(a_pos)
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, stride, 0)

    let a_tex = gl.getAttribLocation(program, 'a_tex')
    gl.enableVertexAttribArray(a_tex)
    gl.vertexAttribPointer(a_tex, 2, gl.FLOAT, false, stride, 2 * 4)


    gl.bindVertexArray(null)

    function drawVAO(a_buff_data: Float32Array, i_buff_data: Uint16Array, nb: number) {
        gl.bindBuffer(gl.ARRAY_BUFFER, a_buff)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, a_buff_data, 0)

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, i_buff)
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, i_buff_data, 0)

        gl.bindVertexArray(vao)
        gl.drawElements(gl.TRIANGLES, nb * 6, gl.UNSIGNED_SHORT, 0)
    }

    return { drawVAO }
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
    let vshader = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vshader, vs)
    gl.compileShader(vshader)

    let fshader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fshader, fs)
    gl.compileShader(fshader)

    let program = gl.createProgram()!
    gl.attachShader(program, vshader)
    gl.attachShader(program, fshader)
    gl.linkProgram(program)

    gl.deleteShader(vshader)
    gl.deleteShader(fshader)

    return program
}