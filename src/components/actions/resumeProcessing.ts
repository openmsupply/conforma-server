/**
 * If the server is shut down while there are still triggers being processed in
 * the "Throttle" queue, this will ensure that they get re-started. This should
 * ONLY be called at start-up, before any other trigger/action related methods.
 */

import { Trigger } from '../../generated/graphql'
import DBConnect from '../database/databaseConnect'

export const resumeTriggerProcessing = async () => {
  console.log('Checking for in-progress triggers...')
  // Set any trigger_queue items that are "ACTIONS_DISPATCHED" to "COMPLETED"
  await db.updateDispatchedTriggers()

  // Get all from trigger_queue that are currently "TRIGGERED"
  const activeTriggers = await db.getProcessingTriggers()

  // Delete all those records
  const idsToDelete = activeTriggers?.map((trigger) => trigger.id)
  if (idsToDelete && activeTriggers) {
    await db.deleteTriggers(idsToDelete)

    // Re-insert those triggers so they re-fire their actions
    for (const trigger of activeTriggers) {
      await db.reinsertTrigger(trigger)
    }
  }
}

const db = {
  updateDispatchedTriggers: async () => {
    const text = `
        UPDATE trigger_queue
        SET status = 'COMPLETED'
        WHERE status = 'ACTIONS_DISPATCHED';
    `
    try {
      await DBConnect.query({ text })
    } catch {
      console.log('Problem updating ACTIONS_DISPATCHED triggers')
    }
  },
  getProcessingTriggers: async () => {
    const text = `
        SELECT id, trigger_type, "table", record_id,
        event_code, data, log, application_id
        FROM trigger_queue
        WHERE status = 'TRIGGERED';
    `
    try {
      const result = await DBConnect.query({ text })
      return result.rows
    } catch {
      console.log('Problem fetching in-progress trigger events')
    }
  },
  deleteTriggers: async (idsToDelete: number[]) => {
    const text = `
        DELETE FROM trigger_queue
        WHERE id = ANY($1);
    `
    try {
      await DBConnect.query({ text, values: [idsToDelete] })
    } catch {
      console.log('Problem deleting active triggers')
    }
  },
  reinsertTrigger: async ({
    trigger_type,
    table,
    record_id,
    event_code,
    data,
    log,
    application_id,
  }: {
    trigger_type: Trigger
    table: string
    record_id: number
    event_code: string | null
    data: object | null
    log: string | null
    application_id: number | null
  }) => {
    const text = `
        INSERT INTO trigger_queue
            (trigger_type, "table", record_id, event_code,
            data, status, log, application_id )
        VALUES($1, $2, $3, $4, $5, 'TRIGGERED', $6, $7)`
    try {
      await DBConnect.query({
        text,
        values: [trigger_type, table, record_id, event_code, data, log, application_id],
      })
    } catch {
      console.log('Problem re-inserting trigger')
    }
  },
}
