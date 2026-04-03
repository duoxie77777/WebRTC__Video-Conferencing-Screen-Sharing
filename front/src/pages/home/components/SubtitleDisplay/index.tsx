import { useEffect, useState, useRef, useCallback } from 'react'

export interface SubtitleItem {
    id: string
    from: string
    text: string
    timestamp: number
}

interface SubtitleDisplayProps {
    subtitles: SubtitleItem[]
}

const SUBTITLE_DURATION = 4000

const SubtitleDisplay: React.FC<SubtitleDisplayProps> = ({ subtitles }) => {
    const [currentSubtitle, setCurrentSubtitle] = useState<SubtitleItem | null>(null)
    const hideTimeoutRef = useRef<number | null>(null)

    const clearHideTimeout = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current)
            hideTimeoutRef.current = null
        }
    }, [])

    useEffect(() => {
        if (subtitles.length === 0) return

        const latestSubtitle = subtitles[subtitles.length - 1]
        
        if (currentSubtitle?.id === latestSubtitle.id) {
            return
        }

        clearHideTimeout()
        setCurrentSubtitle(latestSubtitle)

        hideTimeoutRef.current = window.setTimeout(() => {
            setCurrentSubtitle(null)
        }, SUBTITLE_DURATION)

        return () => {
            clearHideTimeout()
        }
    }, [subtitles, currentSubtitle, clearHideTimeout])

    if (!currentSubtitle) {
        return null
    }

    return (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="bg-black/75 backdrop-blur-sm text-white px-6 py-3 rounded-lg max-w-[80vw] text-center">
                <span className="text-sm text-blue-300 mr-2">{currentSubtitle.from}:</span>
                <span className="text-lg">{currentSubtitle.text}</span>
            </div>
        </div>
    )
}

export default SubtitleDisplay
