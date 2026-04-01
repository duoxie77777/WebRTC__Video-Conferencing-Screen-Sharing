import { useState, useRef, useCallback } from 'react'
import { Modal, InputNumber, Space, Button } from 'antd'
import { DragOutlined } from '@ant-design/icons'

export interface CropRegion {
    x: number
    y: number
    width: number
    height: number
}

interface RegionPickerProps {
    open: boolean
    onConfirm: (region: CropRegion) => void
    onCancel: () => void
}

/** 屏幕共享区域选择器 —— 可拖拽 + 可调整大小 */
const RegionPicker = ({ open, onConfirm, onCancel }: RegionPickerProps) => {
    const [region, setRegion] = useState<CropRegion>({ x: 0, y: 0, width: 1280, height: 720 })
    const boxRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const dragging = useRef(false)
    const resizing = useRef(false)
    const startPos = useRef({ mx: 0, my: 0, rx: 0, ry: 0, rw: 0, rh: 0 })

    const SCALE = 0.25 // 预览缩放比例：容器里1px = 屏幕4px

    const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'drag' | 'resize') => {
        e.preventDefault()
        e.stopPropagation()
        if (mode === 'drag') dragging.current = true
        else resizing.current = true
        startPos.current = { mx: e.clientX, my: e.clientY, rx: region.x, ry: region.y, rw: region.width, rh: region.height }

        const handleMouseMove = (ev: MouseEvent) => {
            const dx = (ev.clientX - startPos.current.mx) / SCALE
            const dy = (ev.clientY - startPos.current.my) / SCALE

            if (dragging.current) {
                setRegion((prev) => ({
                    ...prev,
                    x: Math.max(0, Math.round(startPos.current.rx + dx)),
                    y: Math.max(0, Math.round(startPos.current.ry + dy)),
                }))
            } else if (resizing.current) {
                setRegion((prev) => ({
                    ...prev,
                    width: Math.max(200, Math.round(startPos.current.rw + dx)),
                    height: Math.max(150, Math.round(startPos.current.rh + dy)),
                }))
            }
        }

        const handleMouseUp = () => {
            dragging.current = false
            resizing.current = false
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
    }, [region])

    // 预设尺寸
    const presets: { label: string; w: number; h: number }[] = [
        { label: '720p', w: 1280, h: 720 },
        { label: '1080p', w: 1920, h: 1080 },
        { label: '小窗口', w: 800, h: 600 },
        { label: '方形', w: 800, h: 800 },
    ]

    return (
        <Modal
            title="选择共享区域"
            open={open}
            onOk={() => onConfirm(region)}
            onCancel={onCancel}
            okText="开始共享"
            cancelText="取消"
            width={560}
        >
            <div className="mb-3">
                <Space size="small" wrap>
                    {presets.map((p) => (
                        <Button
                            key={p.label}
                            size="small"
                            type={region.width === p.w && region.height === p.h ? 'primary' : 'default'}
                            onClick={() => setRegion((prev) => ({ ...prev, width: p.w, height: p.h }))}
                        >
                            {p.label} ({p.w}×{p.h})
                        </Button>
                    ))}
                </Space>
            </div>

            {/* 手动输入 */}
            <div className="mb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">X:</span>
                <InputNumber size="small" min={0} value={region.x} onChange={(v) => setRegion((prev) => ({ ...prev, x: v || 0 }))} style={{ width: 80 }} />
                <span className="text-xs text-gray-500">Y:</span>
                <InputNumber size="small" min={0} value={region.y} onChange={(v) => setRegion((prev) => ({ ...prev, y: v || 0 }))} style={{ width: 80 }} />
                <span className="text-xs text-gray-500">宽:</span>
                <InputNumber size="small" min={200} value={region.width} onChange={(v) => setRegion((prev) => ({ ...prev, width: v || 200 }))} style={{ width: 80 }} />
                <span className="text-xs text-gray-500">高:</span>
                <InputNumber size="small" min={150} value={region.height} onChange={(v) => setRegion((prev) => ({ ...prev, height: v || 150 }))} style={{ width: 80 }} />
            </div>

            {/* 可视化预览区域 */}
            <div
                ref={containerRef}
                className="relative bg-gray-900 rounded-lg overflow-hidden border border-gray-600"
                style={{ width: 500, height: 300 }}
            >
                {/* 模拟屏幕背景 */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-950 flex items-center justify-center">
                    <span className="text-gray-600 text-xs">屏幕预览（拖拽蓝色区域调整位置，拖拽右下角调整大小）</span>
                </div>

                {/* 选区框 */}
                <div
                    ref={boxRef}
                    className="absolute border-2 border-blue-400 bg-blue-400/15 cursor-move"
                    style={{
                        left: region.x * SCALE,
                        top: region.y * SCALE,
                        width: region.width * SCALE,
                        height: region.height * SCALE,
                    }}
                    onMouseDown={(e) => handleMouseDown(e, 'drag')}
                >
                    {/* 尺寸标签 */}
                    <div className="absolute top-1 left-1 bg-blue-500 text-white text-[9px] px-1 rounded flex items-center gap-0.5">
                        <DragOutlined /> {region.width}×{region.height}
                    </div>

                    {/* 右下角调整手柄 */}
                    <div
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize border border-white"
                        onMouseDown={(e) => handleMouseDown(e, 'resize')}
                    />
                </div>
            </div>

            <div className="mt-2 text-xs text-gray-400">
                选择共享区域后，只有蓝色框内的屏幕内容会被共享给其他人
            </div>
        </Modal>
    )
}

export default RegionPicker
