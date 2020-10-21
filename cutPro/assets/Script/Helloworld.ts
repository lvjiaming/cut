import Plane from "./Plane";
import MeshRend from "./MeshRend";

const {ccclass, property} = cc._decorator;

@ccclass
export default class Helloworld extends cc.Component {

    @property({
        type: cc.Node,
        tooltip: "线",
    })
    lineNode = null;

    @property({
        type: cc.Prefab,
        tooltip: "木板预制体",
    })
    planePre = null;

    @property({
        type: cc.RopeJoint,
        tooltip: "关节节点",
    })
    rope = null;

    onLoad() {
        var manager = cc.director.getCollisionManager();
        manager.enabled = true;
        manager.enabledDebugDraw = true;
        manager.enabledDrawBoundingBox = true;
        cc.director.getPhysicsManager().enabled = true;

        cc.director.getPhysicsManager().debugDrawFlags = cc.PhysicsManager.DrawBits.e_aabbBit |
            cc.PhysicsManager.DrawBits.e_pairBit |
            cc.PhysicsManager.DrawBits.e_centerOfMassBit |
            cc.PhysicsManager.DrawBits.e_jointBit |
            cc.PhysicsManager.DrawBits.e_shapeBit
        ;
    }

    start () {
        this.node.on("touchstart", this._touchStart, this);
        this.node.on("touchmove", this._touchMove, this);
        this.node.on("touchend", this._touchEnd, this);
        this.node.on("touchcancel", this._touchEnd, this);
    }

    onDestroy() {
        this.node.off("touchstart", this._touchStart, this);
        this.node.off("touchmove", this._touchMove, this);
        this.node.off("touchend", this._touchEnd, this);
        this.node.off("touchcancel", this._touchEnd, this);
    }

    private _touchStart(event): void {
        const pos = this.node.convertToNodeSpaceAR(event.touch._point);
        this.lineNode.position = pos;
        this.lineNode.width = 0;
    }

    private _touchMove(event): void {
        const endPos = this.node.convertToNodeSpaceAR(event.touch._point);
        const startPos = this.node.convertToNodeSpaceAR(event.touch._startPoint);
        this.lineNode.width = startPos.sub(endPos).mag();
        this.lineNode.angle = this._rotationTarget(startPos, endPos);
    }

    private _touchEnd(event): void {
        this.lineNode.width = 0;
        const endPos = this.node.convertToNodeSpaceAR(event.touch._point);
        const startPos = this.node.convertToNodeSpaceAR(event.touch._startPoint);
        this._recalcResults(event.touch._startPoint, event.touch._point);
    }

    /**角度计算 */
    private _rotationTarget(startPos: cc.Vec2, endPos: cc.Vec2) {
        let direction = endPos.sub(startPos).normalize();
        let radian = direction.signAngle(cc.v2(1, 0));
        //将弧度转换为欧拉角
        let angle = radian / Math.PI * 180 + 90;
        //返回角度
        return -angle + 90;
    }

    /**
     *  进行射线检测
     * @private
     */
    private _recalcResults(startPos: cc.Vec2, endPos: cc.Vec2): void {
        const cutArr = [];
        let result = cc.director.getPhysicsManager().rayCast(startPos, endPos, cc.RayCastType.All);
        cc.log(result);
        result.forEach((res) => {
            const col = res.collider;
            if (col.node.name == "Plane") {
                let hasCut = false;
                for (let index = 0; index < cutArr.length; index++) {
                    if (col == cutArr[index]) {
                        hasCut = true;
                        break;
                    }
                }
                if (!hasCut) {
                    cutArr.push(col);
                    this._checkCutPolygon(startPos, endPos, col);
                }
            }
        });
    }

    private _checkCutPolygon(startPos: cc.Vec2, endPos: cc.Vec2, col): void {
        // 将世界坐标转换为刚体内部坐标
        let localPoint1 = cc.Vec2.ZERO;
        let localPoint2 = cc.Vec2.ZERO;
        col.body.getLocalPoint(startPos, localPoint1);
        col.body.getLocalPoint(endPos, localPoint2);

        let splitResults = [];
        let intersectPoint = [];
        this._lineCutPolygon(localPoint1, localPoint2, col.points, splitResults, intersectPoint);
        cc.log(splitResults);

        col.node.destroy();
        for (let j = 0; j < splitResults.length; j++) {
            let splitResult = splitResults[j];
            // if (splitResult.length < 3) continue;
            this.cloneNode(col.node, splitResult);
        }
    }

    cloneNode(node: cc.Node, splitResult: Array<any>): boolean {
        //更具节点名字在对象池中获取节点
        let isOk: boolean = false;
        let fruitNode: cc.Node = cc.instantiate(this.planePre);
        fruitNode.position = node.position;
        fruitNode.angle = node.angle;
        fruitNode.name = node.name;
        try {
            this.node.addChild(fruitNode);
            let collider = fruitNode.getComponent(cc.PhysicsPolygonCollider);
            // if (this.rope) { // 有关节组件的时候用
            //     this.rope.connectedBody = collider.getComponent(cc.RigidBody) || collider.addComponent(cc.RigidBody);
            //     this.rope.apply();
            // }
            fruitNode.getComponent(cc.PhysicsPolygonCollider).friction = 0.01;
            collider.points = splitResult;
            collider.apply();
            // fruitNode.getComponent(Plane).draw();
            fruitNode.getComponent(MeshRend).vertexes = splitResult;
            // this.fruitIndex++;
            isOk = true;
        } catch (error) {
            console.log("出现异常--，克隆", error);
            fruitNode.destroy();
            isOk = false;
        }
        return isOk;
    }

    private _lineCutPolygon(p1: cc.Vec2, p2: cc.Vec2, polygonPoints: cc.Vec2[], splitResults, intersectPoint: cc.Vec2[]): void {
        let points: cc.Vec2[] = [];
        let pointIndex: number[] = [];   //相交点的索引
        let intersectPoints: cc.Vec2[] = [];
        //将多边形所有的点以及交点组成一个点的序列
        for (let i = 0; i < polygonPoints.length; i++) {
            points.push(polygonPoints[i]);

            let a: cc.Vec2 = polygonPoints[i];
            let b: cc.Vec2 = polygonPoints[0];
            if (i < polygonPoints.length - 1) b = polygonPoints[i + 1];
            //计算当前点和下一个点组成的线段和p1,p2组成的线段是不是有交点，有的话是多少
            let c = this.lineCrossPoint(p1, p2, a, b);
            if (c[0] == 0) {   //相交
                pointIndex.push(points.length);
                points.push(c[1] as cc.Vec2);
                intersectPoints.push(c[1] as cc.Vec2);
            } else if (c[0] > 0) {
                if ((c[1] as cc.Vec2).equals(a)) {      //共有点
                    pointIndex.push(points.length - 1);
                    intersectPoints.push(points[points.length - 1]);
                }
                else {    //这种情况基本不存在
                    pointIndex.push(points.length);
                }
            }
        }
        //如果交点个数大于1 说明进行了切割
        if (pointIndex.length > 1) {
            //对切割垫进行排序
            //根据碰撞点的到p1 的距离,将切割点由近到远排列
            //冒泡排序操作
            for (let i = 0; i < intersectPoints.length; i++) {	//外层循环控制排序轮数
                for (let j = 0; j < intersectPoints.length - i - 1; j++) {
                    let dis1: number = this.getDisPoints(p1, intersectPoints[j]);
                    let dis2: number = this.getDisPoints(p1, intersectPoints[j + 1]);
                    if (dis1 > dis2) {
                        let temp = intersectPoints[j];
                        intersectPoints[j] = intersectPoints[j + 1];
                        intersectPoints[j + 1] = temp;
                    }
                }
            }
            intersectPoint.push(intersectPoints[0])
            intersectPoint.push(intersectPoints[intersectPoint.length - 1])
            //准备从第一个开始拆分 先弄清楚第一个交点是由内穿外，还是外穿内
            let cp0 = points[pointIndex[0]];
            let cp1 = points[pointIndex[1]];
            let r = this.relationPointToPolygon(new cc.Vec2((cp0.x + cp1.x) / 2, (cp0.y + cp1.y) / 2), polygonPoints);

            let inPolygon: boolean = r >= 0;
            if (pointIndex.length > 2 && this.getDisPoints(cp0, cp1) > this.getDisPoints(cp0, points[pointIndex[pointIndex.length - 1]])) {
                cp1 = points[pointIndex[pointIndex.length - 1]];
                r = this.relationPointToPolygon(new cc.Vec2((cp0.x + cp1.x) / 2, (cp0.y + cp1.y) / 2), polygonPoints);
                inPolygon = r < 0;
            }
            let firstInPolygon = inPolygon;//起始点是从外面穿到里面

            let index = 0;
            let startIndex = pointIndex[index];
            let oldPoints = [];
            let newPoints = [];
            let count = 0;

            oldPoints.push(points[startIndex]);
            if (inPolygon) {
                newPoints.push(points[startIndex]);
            }

            index++;
            count++;
            startIndex++;

            while (count < points.length) {
                if (startIndex == points.length) startIndex = 0;
                let p = points[startIndex];
                if (index >= 0 && startIndex == pointIndex[index]) {
                    //又是一个交点
                    index++;
                    if (index >= pointIndex.length) index = 0;
                    if (inPolygon) {
                        //原来是在多边形内部
                        //产生了新的多边形
                        newPoints.push(p);
                        splitResults.push(newPoints);
                        newPoints = [];
                    }
                    else {
                        //开始新的多边形
                        newPoints = [];
                        newPoints.push(p);
                    }
                    oldPoints.push(p);
                    inPolygon = !inPolygon;
                }
                else {
                    //普通的点
                    if (inPolygon) {
                        newPoints.push(p);
                    }
                    else {
                        oldPoints.push(p);
                    }
                }
                startIndex++;
                count++;
            }
            if (inPolygon) {
                if (!firstInPolygon && newPoints.length > 1) {
                    //如果起始点是从里面穿出去，到这里跟起始点形成闭包
                    newPoints.push(points[pointIndex[0]]);
                    splitResults.push(newPoints);
                }
                else {
                    //结束了，但是现在的状态是穿在多边形内部
                    //把newPoints里面的回复到主多边形中
                    for (let i = 0; i < newPoints.length; ++i) {
                        oldPoints.push(newPoints[i]);
                    }
                }

            }

            splitResults.push(oldPoints);
        }
    }

    //点和多边形的关系
    //返回值: -1:在多边形外部, 0:在多边形内部, 1:在多边形边线内, 2:跟多边形某个顶点重合
    private relationPointToPolygon(point: cc.Vec2, polygon: cc.Vec2[]) {
        let count = 0;
        for (let i = 0; i < polygon.length; ++i) {
            if (polygon[i].equals(point)) {
                return 2;
            }

            let pa = polygon[i];
            let pb = polygon[0];
            if (i < polygon.length - 1) {
                pb = polygon[i + 1];
            }

            let re = this.rayPointToLine(point, pa, pb);
            if (re == 1) {
                return 1;
            }
            if (re == 0) {
                count++;
            }
        }
        if (count % 2 == 0) {
            return -1;
        }
        return 0;
    }

    /**
     * 获取两点之间的距离
     */
    private getDisPoints(pos_start: cc.Vec2, pos_end: cc.Vec2): number {
        let dis: number = 0;
        //触摸点与起始点x,y轴的距离
        var x_distance = pos_start.x - pos_end.x;
        var y_distance = pos_start.y - pos_end.y;
        // 勾股定理求斜边
        dis = Math.sqrt(Math.pow(x_distance, 2) + Math.pow(y_distance, 2));
        return dis;
    }

    //点发出的右射线和线段的关系
    // 返回值: -1:不相交, 0:相交, 1:点在线段上
    private rayPointToLine(point: cc.Vec2, linePA: cc.Vec2, linePB: cc.Vec2) {
        // 定义最小和最大的X Y轴值
        let minX = Math.min(linePA.x, linePB.x);
        let maxX = Math.max(linePA.x, linePB.x);
        let minY = Math.min(linePA.y, linePB.y);
        let maxY = Math.max(linePA.y, linePB.y);

        // 射线与边无交点的其他情况
        if (point.y < minY || point.y > maxY || point.x > maxX) {
            return -1;
        }

        // 剩下的情况, 计算射线与边所在的直线的交点的横坐标
        let x0 = linePA.x + ((linePB.x - linePA.x) / (linePB.y - linePA.y)) * (point.y - linePA.y);
        if (x0 > point.x) {
            return 0;
        }
        if (x0 == point.x) {
            return 1;
        }
        return -1;
    }

    /**
     * 求两条线段的交点
     * @param p1
     * @param p2
     * @param q1
     * @param q2
     * 返回值：[n,p] n:0相交，1在共有点，-1不相交  p:交点
     */
    public lineCrossPoint(p1: cc.Vec2, p2: cc.Vec2, q1: cc.Vec2, q2: cc.Vec2) {
        let a = p1, b = p2, c = q1, d = q2;
        let s1, s2, s3, s4;
        let d1, d2, d3, d4;
        let p: cc.Vec2 = new cc.Vec2(0, 0);
        d1 = this.dblcmp(s1 = this.ab_cross_ac(a, b, c), 0);
        d2 = this.dblcmp(s2 = this.ab_cross_ac(a, b, d), 0);
        d3 = this.dblcmp(s3 = this.ab_cross_ac(c, d, a), 0);
        d4 = this.dblcmp(s4 = this.ab_cross_ac(c, d, b), 0);

        //如果规范相交则求交点
        if ((d1 ^ d2) == -2 && (d3 ^ d4) == -2) {
            p.x = (c.x * s2 - d.x * s1) / (s2 - s1);
            p.y = (c.y * s2 - d.y * s1) / (s2 - s1);
            return [0, p];
        }

        //如果不规范相交
        if (d1 == 0 && this.point_on_line(c, a, b) <= 0) {
            p = c;
            return [1, p];
        }
        if (d2 == 0 && this.point_on_line(d, a, b) <= 0) {
            p = d;
            return [1, p];
        }
        if (d3 == 0 && this.point_on_line(a, c, d) <= 0) {
            p = a;
            return [1, p];
        }
        if (d4 == 0 && this.point_on_line(b, c, d) <= 0) {
            p = b;
            return [1, p];
        }
        //如果不相交
        return [-1, null];
    }
    //求a点是不是在线段上，>0不在，=0与端点重合，<0在。
    public point_on_line(a, p1, p2) {
        return this.dblcmp(this.dot(p1.x - a.x, p1.y - a.y, p2.x - a.x, p2.y - a.y), 0);
    }

    private ab_cross_ac(a, b, c) //ab与ac的叉积
    {
        return this.cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
    }
    private dot(x1, y1, x2, y2) {
        return x1 * x2 + y1 * y2;
    }
    private cross(x1, y1, x2, y2) {
        return x1 * y2 - x2 * y1;
    }
    private dblcmp(a: number, b: number) {
        if (Math.abs(a - b) <= 0.000001) return 0;
        if (a > b) return 1;
        else return -1;
    }
}
