import { init } from './init.js'
import { setup } from './setup.js'
import { audit } from './audit.js'

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
}

export async function install() {
  const line = '═'.repeat(45)
  console.log(`\n${line}`)
  console.log(`${COLORS.bold}        REX INSTALL — One Command${COLORS.reset}`)
  console.log(`${line}\n`)

  await init()

  await setup({
    nonInteractive: true,
    autoInstallDeps: true,
    skipTelegram: process.env.REX_SKIP_TELEGRAM === '1',
  })

  console.log(`\n${COLORS.dim}Running post-install audit...${COLORS.reset}`)
  await audit()

  console.log(`\n${COLORS.green}${COLORS.bold}REX install complete.${COLORS.reset}`)
}
