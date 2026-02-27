#!/usr/bin/env node
import { execSync } from 'child_process'
import readline from 'readline'

const CURRENT_PID = process.ppid

function getProcesses() {
  const output = execSync('ps aux', { encoding: 'utf-8' })
  const lines = output.split('\n').slice(1)

  const processes = []
  for (const line of lines) {
    if (!line.trim()) continue
    const parts = line.trim().split(/\s+/)
    const pid = parseInt(parts[1])
    const startTime = parts[8]
    const command = parts.slice(10).join(' ')

    const isClaude = /\/claude(\s|$)/.test(command) || /^\s*claude\s*$/.test(command)
    const isDaemon = command.includes('idea-claude-code-gui') && command.includes('daemon.js')
    const isClaudeMem = command.includes('claude-mem') && command.includes('mcp-server')
    const isStreamJson = command.includes('--output-format stream-json')

    if (!isClaude && !isDaemon && !isClaudeMem && !isStreamJson) continue

    // 排除系统 daemon（cloudd, cfprefsd 等）
    if (command.includes('cloudd') || command.includes('cfprefsd')) continue

    let type = '未知'
    if (isStreamJson) type = 'Claude 子进程 (IDE)'
    else if (isClaude) type = 'Claude 会话'
    else if (isDaemon) type = 'Daemon 守护进程'
    else if (isClaudeMem) type = 'MCP 插件 (claude-mem)'

    processes.push({ pid, startTime, type, command: command.slice(0, 80) })
  }

  return processes
}

function printTable(processes) {
  if (processes.length === 0) {
    console.log('\n  没有找到 Claude 相关进程。\n')
    return
  }

  console.log('')
  console.log('  ' + '-'.repeat(70))
  console.log(`  ${'PID'.padEnd(8)} ${'启动时间'.padEnd(10)} ${'类型'.padEnd(26)} 命令片段`)
  console.log('  ' + '-'.repeat(70))

  for (const p of processes) {
    const shortCmd = p.command.length > 40 ? p.command.slice(0, 40) + '...' : p.command
    console.log(`  ${String(p.pid).padEnd(8)} ${p.startTime.padEnd(10)} ${p.type.padEnd(22)} ${shortCmd}`)
  }

  console.log('  ' + '-'.repeat(70))
  console.log(`  共 ${processes.length} 个进程\n`)
}

function killProcesses(pids) {
  let killed = 0
  let failed = 0
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
      killed++
    } catch {
      failed++
    }
  }
  console.log(`\n  已关闭 ${killed} 个进程` + (failed > 0 ? `，${failed} 个失败` : '') + '\n')
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer.trim()) }))
}

// --- 主流程 ---
console.log('\n  Claude 进程管理工具')
console.log('  ==================\n')

const processes = getProcesses()
printTable(processes)

if (processes.length === 0) process.exit(0)

const answer = await ask('  要关闭这些进程吗？(y=全部关闭 / n=不关闭 / 输入PID用逗号隔开): ')

if (answer.toLowerCase() === 'y') {
  killProcesses(processes.map(p => p.pid))
} else if (answer.toLowerCase() === 'n') {
  console.log('\n  已取消。\n')
} else {
  const pids = answer.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && n > 0)
  if (pids.length > 0) {
    killProcesses(pids)
  } else {
    console.log('\n  无效输入，已取消。\n')
  }
}

// 关闭后再查一次
const remaining = getProcesses()
if (remaining.length > 0) {
  console.log('  关闭后剩余进程:')
  printTable(remaining)
}
