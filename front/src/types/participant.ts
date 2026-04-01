/** 每个参与者的状态 */
export interface Participant {
  name: string
  stream: MediaStream | null
  screenStream: MediaStream | null
  cameraOn: boolean
  micOn: boolean
  sharing: boolean
}
