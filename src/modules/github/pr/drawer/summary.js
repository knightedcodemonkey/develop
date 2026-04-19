import { toSafeText } from './common.js'

const buildSummary = ({
  repository,
  baseBranch,
  headBranch,
  fileCommits,
  prTitle,
  commitMessage,
  actionType,
}) => {
  const repositoryLabel = toSafeText(repository?.fullName) || 'No repository selected'
  const isPushCommit = actionType === 'push-commit'

  const lines = [
    `Repository: ${repositoryLabel}`,
    `Head branch: ${headBranch}`,
    `PR title: ${prTitle}`,
    `Commit message: ${commitMessage}`,
  ]

  if (Array.isArray(fileCommits) && fileCommits.length > 0) {
    lines.push('Files to commit:')
    for (const fileCommit of fileCommits) {
      const path = toSafeText(fileCommit?.path)
      if (!path) {
        continue
      }

      const tabLabel = toSafeText(fileCommit?.tabLabel)
      lines.push(tabLabel ? `- ${tabLabel} -> ${path}` : `- ${path}`)
    }
  }

  if (!isPushCommit) {
    lines.splice(1, 0, `Base branch: ${baseBranch}`)
  }

  lines.push('')
  lines.push(
    isPushCommit
      ? 'Proceed with committing editor content to the active pull request branch?'
      : 'Proceed with creating commits and opening this pull request?',
  )

  return lines.join('\n')
}

export { buildSummary }
