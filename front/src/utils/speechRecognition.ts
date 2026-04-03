declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognition
        webkitSpeechRecognition: new () => SpeechRecognition
    }
}

interface SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    onresult: ((event: any) => void) | null
    onend: (() => void) | null
    onerror: ((event: any) => void) | null
    start(): void
    stop(): void
    abort(): void
}

export class SpeechRecognitionService {
    private recognition: SpeechRecognition | null = null
    private callback: ((text: string) => void) | null = null
    private isRunning = false

    isSupported(): boolean {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
        return !!SpeechRecognitionAPI
    }

    onSubtitle(callback: (text: string) => void) {
        this.callback = callback
    }

    start() {
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SpeechRecognitionAPI) {
            console.warn('[语音识别] 浏览器不支持')
            return
        }
        
        if (this.isRunning) return

        // 每次启动时重新创建实例
        this.recognition = new SpeechRecognitionAPI()
        this.recognition.lang = 'zh-CN'
        this.recognition.continuous = true
        this.recognition.interimResults = true

        this.recognition.onresult = (e: any) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const transcript = e.results[i][0].transcript
                if (e.results[i].isFinal && transcript.trim()) {
                    console.log('[语音识别] 识别结果:', transcript)
                    this.callback?.(transcript.trim())
                }
            }
        }

        this.recognition.onend = () => {
            if (this.isRunning && this.recognition) {
                setTimeout(() => {
                    try {
                        this.recognition?.start()
                    } catch (e) {}
                }, 100)
            }
        }

        this.recognition.onerror = (e: any) => {
            console.warn('[语音识别] 错误:', e.error)
        }

        this.isRunning = true
        try {
            this.recognition.start()
            console.log('[语音识别] 已启动')
        } catch (e) {
            console.warn('[语音识别] 启动失败:', e)
        }
    }

    stop() {
        this.isRunning = false
        if (this.recognition) {
            try {
                this.recognition.stop()
            } catch (e) {}
            this.recognition = null
        }
    }

    destroy() {
        this.stop()
        this.callback = null
    }
}
