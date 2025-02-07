/**
 * Throttle provides a mechanism to prevent certain functions from being called
 * too many times simultaneously. Used to limit too many simultaneous
 * Action Triggers. This can happen (for example) when many thousands of
 * products are set to expire at the exact same time. Without this safeguard,
 * the system is overrun with simultaneous actions which causes numerous errors.
 *
 * The throttle captures all the function calls (using the .add method), but,
 * when multiple calls are made in quick succession, they are put in a queue so
 * they can be executed sequentially.
 */

/**
 * "add" events captured within this time (since the last addition) are pushed
 * to the end of the queue -- all others are bumped to the front of the queue.
 * This way, a large in-progress queue won't prevent additional actions being
 * run, otherwise users would experience trigger timeouts due to their event
 * being put at the back of the queue.
 */
const THROTTLE_QUEUE_THRESHOLD = 200 // ms

interface EventObject<T> {
  name: string
  data: T
  action: (data: T) => unknown
}

export class EventThrottle {
  queue: EventObject<any>[]
  timerId: NodeJS.Timeout | undefined
  queueActive: boolean

  constructor() {
    this.queue = []
    this.queueActive = false
  }

  handleQueue = async () => {
    // The "queueActive" flag ensures that only one instance of "handleQueue"
    // will be processing the queue, which ensures queued events will be
    // executed sequentially by a single thread
    if (this.queueActive) return

    this.queueActive = true
    while (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) {
        const { data, action, name } = next
        console.log('Processing queued event', name)
        try {
          await action(data)
        } catch (e) {
          console.log('Error while running throttled action: ', e)
        }
        console.log(`${this.queue.length} events remaining in queue`)
      }
    }
    this.queueActive = false
  }

  public add<T>(event: EventObject<T>): void {
    // Timer is used solely to determine whether to put new events at the front
    // or end of the queue.
    const currentTimer = this.timerId
    this.timerId = setTimeout(() => (this.timerId = undefined), THROTTLE_QUEUE_THRESHOLD)

    if (!currentTimer) {
      console.log('Bumping event to front of queue:', event.name)
      this.queue.unshift(event)
    } else {
      console.log('Queueing event:', event.name)
      this.queue.push(event)
      clearTimeout(currentTimer)
    }

    this.handleQueue()
  }
}
