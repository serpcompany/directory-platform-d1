import { type CategoryOption, GitHubIssueSubmitForm } from './github-issue-submit-form'

export function SubmitPageSurface({
  categoryOptions
}: {
  categoryOptions: readonly CategoryOption[]
}) {
  return (
    <section className="container mx-auto max-w-3xl px-6 py-16">
      <GitHubIssueSubmitForm categoryOptions={categoryOptions} />
    </section>
  )
}
