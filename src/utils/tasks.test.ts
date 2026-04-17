import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'bun:test'
import { TodoWriteTool } from '../tools/TodoWriteTool/TodoWriteTool.js'
import {
  applyTodoListToCanonicalTasks,
  buildTaskSnapshotFromToolUseLog,
  getCanonicalTodoList,
  getTasksDir,
  listCanonicalTasks,
  resetTaskList,
} from './tasks.js'

async function cleanupTaskList(taskListId: string): Promise<void> {
  await resetTaskList(taskListId)
  await rm(getTasksDir(taskListId), { recursive: true, force: true })
}

describe('task canonical adapters', () => {
  const createdTaskLists: string[] = []

  afterEach(async () => {
    for (const taskListId of createdTaskLists.splice(0)) {
      await cleanupTaskList(taskListId)
    }
    delete process.env.CLAUDE_CODE_TASK_LIST_ID
  })

  it('applies TodoWrite-style todos into canonical task storage', async () => {
    const taskListId = `task-test-${Date.now()}`
    createdTaskLists.push(taskListId)

    await applyTodoListToCanonicalTasks(taskListId, [
      {
        content: 'first task',
        status: 'pending',
        activeForm: 'Working first task',
      },
      {
        content: 'second task',
        status: 'in_progress',
        activeForm: 'Working second task',
      },
    ])

    const tasks = await listCanonicalTasks(taskListId)
    expect(tasks.map(task => task.subject)).toEqual([
      'first task',
      'second task',
    ])
    expect(tasks.map(task => task.status)).toEqual(['pending', 'in_progress'])

    const todoList = await getCanonicalTodoList(taskListId)
    expect(todoList).toEqual([
      {
        content: 'first task',
        status: 'pending',
        activeForm: 'Working first task',
      },
      {
        content: 'second task',
        status: 'in_progress',
        activeForm: 'Working second task',
      },
    ])
  })

  it('TodoWrite tool translates to canonical task storage', async () => {
    const taskListId = `task-tool-${Date.now()}`
    createdTaskLists.push(taskListId)
    process.env.CLAUDE_CODE_TASK_LIST_ID = taskListId

    const result = await TodoWriteTool.call!(
      {
        todos: [
          {
            content: 'compat task',
            status: 'pending',
            activeForm: 'Working compat task',
          },
        ],
      },
      {
        getAppState: () => ({ todos: {} }),
        setAppState: () => ({}),
      } as never,
    )

    expect(result.data?.newTodos).toEqual([
      {
        content: 'compat task',
        status: 'pending',
        activeForm: 'Working compat task',
      },
    ])

    const tasks = await listCanonicalTasks(taskListId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.subject).toBe('compat task')
  })

  it('replays TaskCreate and TaskUpdate logs into canonical task snapshot', () => {
    const snapshot = buildTaskSnapshotFromToolUseLog([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'create-1',
              name: 'TaskCreate',
              input: {
                subject: 'Task A',
                description: 'Task A desc',
                activeForm: 'Doing task A',
              },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'create-1',
              content: 'Task #1 created successfully: Task A',
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'update-1',
              name: 'TaskUpdate',
              input: {
                taskId: '1',
                status: 'completed',
              },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'update-1',
              content: 'Updated task #1 status',
            },
          ],
        },
      },
    ])

    expect(snapshot).toEqual([
      expect.objectContaining({
        id: '1',
        subject: 'Task A',
        status: 'completed',
      }),
    ])
  })

  it('keeps TodoWrite log compatibility in snapshot replay', () => {
    const snapshot = buildTaskSnapshotFromToolUseLog([
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'todo-1',
              name: 'TodoWrite',
              input: {
                todos: [
                  {
                    content: 'legacy task',
                    status: 'in_progress',
                    activeForm: 'Doing legacy task',
                  },
                ],
              },
            },
          ],
        },
      },
    ])

    expect(snapshot).toEqual([
      expect.objectContaining({
        id: '1',
        subject: 'legacy task',
        status: 'in_progress',
      }),
    ])
  })
})
