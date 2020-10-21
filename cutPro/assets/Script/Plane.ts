// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html
const gfx = cc.gfx;
const {ccclass, property} = cc._decorator;

@ccclass
export default class Plane extends cc.Component {

    private _meshCache: { [key: number]: cc.Mesh } = {}; // 网格缓存
    private _vertexes: cc.Vec2[] = [cc.v2(0, 0), cc.v2(0, 500), cc.v2(500, 500), cc.v2(500, 0)]; // 顶点

    private mesh: cc.Mesh = null; // 当前网格

    private renderer: cc.MeshRenderer = null; // 网格渲染器

    @property
    _spriteFrame: cc.SpriteFrame = null;
    /**
     * !#en The sprite frame of the sprite.
     * !#zh 精灵的精灵帧
     * @property spriteFrame
     * @type {SpriteFrame}
     * @example
     * sprite.spriteFrame = newSpriteFrame;
     */
    get spriteFrame() {
        return this._spriteFrame;
    }
    @property({ type: cc.SpriteFrame, tooltip: '精灵的精灵帧' })
    set spriteFrame(value) {
        this._spriteFrame = value;
        this._refreshAll();
    }

    @property
    _offset: cc.Vec2 = cc.v2(0, 0)
    /**
     * !#en Position offset
     * !#zh 位置偏移量
     * @property offset
     * @type {Vec2}
     */
    get offset() {
        return this._offset;
    }

    onLoad () {

    }

    start () {
        this.draw();
    }

    public _refreshAll(): void {
        this._updateMesh();
        this._applySpriteFrame();
        this._applyVertexes();
    }

    public draw() {
        //获取碰撞包围盒子的点
        let points: any = this.getComponent(cc.PhysicsPolygonCollider).points;
        let mask = this.getComponent(cc.Mask);
        let graphics: cc.Graphics = (<any>mask)._graphics;
        // // @ts-ignore
        // const grapics = mask._graphics;
        //获取绘制 grapics
        // let grapics:cc.Graphics=this.getComponent(cc.Graphics);
        // 擦除之前绘制的所有内容的方法。
        graphics.clear();
        // console.log(points);
        // console.log(graphics);
        let len: number = points.length;
        //移动路径起点到坐标(x, y)
        graphics.moveTo(points[len - 1].x, points[len - 1].y);
        for (let i = 0; i < points.length; i++) {
            graphics.lineTo(points[i].x, points[i].y);
        }
        graphics.strokeColor.fromHEX('#000000');
        graphics.lineWidth = 2;
        graphics.fill();
        graphics.stroke();
    }

    private _updateMesh(): void {
        let mesh = this._meshCache[this._vertexes.length];
        if (!mesh) {
            mesh = new cc.Mesh();
            mesh.init([
                { name: gfx.ATTR_POSITION, type: gfx.ATTR_TYPE_FLOAT32, num: 2 },
                { name: gfx.ATTR_UV0, type: gfx.ATTR_TYPE_FLOAT32, num: 2 },
            ], this._vertexes.length, true)
        }
        this.mesh = mesh;
    }

    /**
     *  更新顶点
     * @private
     */
    private _applyVertexes(): void {
// 设置坐标
        const mesh = this.mesh;
        mesh.setVertices(gfx.ATTR_POSITION, this._vertexes);

        this._calculateUV();

        if (this._vertexes.length >= 3) {
            // 计算顶点索引
            const ids = [];
            // 多边形切割 poly2tri，支持简单的多边形，确保顶点按顺序且不自交
            const countor = this._vertexes.map((p) => { return { x: p.x, y: p.y } });
            const swctx = new poly2tri.SweepContext(countor, { cloneArrays: true });
            // cc.log('countor', countor.length, countor);
            try {
                // 防止失败 使用try
                swctx.triangulate();
                // cc.log('triangulate');
                const triangles = swctx.getTriangles();
                // cc.log('triangles', triangles.length, triangles);

                triangles.forEach((tri) => {
                    tri.getPoints().forEach(p => {
                        const i = countor.indexOf(p as any);
                        ids.push(i);
                    });
                })
            } catch (e) {
                cc.error('poly2tri error', e);
            }

            if (ids.length === 0) {
                cc.log('计算顶点索引 失败');
                ids.push(...this._vertexes.map((v, i) => { return i }));
            }
            // cc.log('ids');
            // cc.log(ids);
            mesh.setIndices(ids);

            this.renderer.mesh = mesh;
        }
    }

    private _calculateUV() {
        const mesh = this.mesh;
        if (this.spriteFrame) {
            // cc.log('_calculateUV')
            const uv = this.spriteFrame.uv;
            const texture = this.spriteFrame.getTexture();
            /**
             *    t
             * l     r
             *    b
             */
            const uv_l = uv[0];
            const uv_r = uv[6];
            const uv_b = uv[3];
            const uv_t = uv[5];

            // cc.log('uv', uv)

            // 计算uv
            const uvs = [];
            for (const pt of this._vertexes) {
                const u = this._lerp(uv_l, uv_r, (pt.x + texture.width / 2 + this.offset.x) / texture.width);
                const v = this._lerp(uv_b, uv_t, (pt.y + texture.height / 2 - this.offset.y) / texture.height);
                uvs.push(cc.v2(u, v));
            }
            mesh.setVertices(gfx.ATTR_UV0, uvs);
        }
    }

    private _lerp(a: number, b: number, w: number) {
        return a + w * (b - a);
    }

    // 更新图片
    private _applySpriteFrame() {
        // cc.log('_applySpriteFrame');
        if (this.spriteFrame) {
            const renderer = this.renderer;
            let material = renderer.getMaterial(0);
            // Reset material
            let texture = this.spriteFrame.getTexture();
            material.define("USE_DIFFUSE_TEXTURE", true);
            material.setProperty('diffuseTexture', texture);
        }
    }

    // update (dt) {}
}
