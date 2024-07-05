import * as github from '@actions/github';
import * as core from '@actions/core';

const labelsToAdd = core
  .getInput('add-labels')
  .split(',')
  .map(x => x.trim());

const labelsToRemove = core
  .getInput('remove-labels')
  .split(',')
  .map(x => x.trim());

/**
 * Obtain the issue number either from input or from the context
 * @param core - the core object
 * @param context - the context object
 * @returns issue/card/pr number if not provided by user.
 */
function getIssueNumber(
  _core: typeof import('@actions/core'),
  _context: typeof github.context
): string | undefined {
  let issueNumber = _core.getInput('issue-number');

  if (issueNumber) return issueNumber;

  issueNumber = _context.payload.issue?.number?.toString() || '';
  if (issueNumber) return issueNumber;

  issueNumber = _context.payload.pull_request?.number?.toString() || '';
  if (issueNumber) return issueNumber;

  const cardUrl = _context.payload.project_card?.content_url;
  issueNumber = cardUrl?.split('/').pop();

  return issueNumber;
}

async function label() {
  const myToken = core.getInput('repo-token');
  const ignoreIfAssigned = core.getInput('ignore-if-assigned');
  const ignoreIfLabeled = core.getInput('ignore-if-labeled');
  const enterpriseUrl = core.getInput('enterprise-url');

  if (enterpriseUrl) {
    console.log('Using enterpriseUrl: ', enterpriseUrl);
  }

  const octokit = enterpriseUrl
    ? github.getOctokit(myToken, { baseUrl: `${enterpriseUrl}/api/v3` })
    : github.getOctokit(myToken);

  const context = github.context;
  const repoName = context.payload.repository?.name;
  const ownerName = context.payload.repository?.owner?.login;
  const issueNumber = getIssueNumber(core, context);

  if (!ownerName || !repoName) {
    return '';
  }

  if (!issueNumber) {
    return 'No action being taken. Ignoring because issueNumber was not identified';
  }

  const filteredLabelsToAdd = labelsToAdd.filter(value => value !== '');

  const filteredLabelsToRemove = labelsToRemove.filter(value => value !== '');

  const updatedIssueInformation = await octokit.rest.issues.get({
    owner: ownerName,
    repo: repoName,
    issue_number: parseInt(issueNumber)
  });

  if (ignoreIfAssigned) {
    if (updatedIssueInformation?.data?.assignees?.length !== 0) {
      return 'No action being taken. Ignoring because one or more assignees have been added to the issue';
    }
  }

  let labels = updatedIssueInformation.data.labels.map(label =>
    typeof label == 'string' ? label : label.name
  );
  if (ignoreIfLabeled) {
    if (labels.length !== 0) {
      return 'No action being taken. Ignoring because one or labels have been added to the issue';
    }
  }

  for (const labelToAdd of filteredLabelsToAdd) {
    if (!labels.includes(labelToAdd)) {
      labels.push(labelToAdd);
    }
  }

  labels = labels.filter(
    value => !filteredLabelsToRemove.includes(value || '')
  );

  await octokit.rest.issues.update({
    owner: ownerName,
    repo: repoName,
    issue_number: parseInt(issueNumber),
    labels: labels as string[]
  });

  return `Updated labels in ${issueNumber}. Added: ${filteredLabelsToAdd}. Removed: ${filteredLabelsToRemove}.`;
}

export async function run() {
  try {
    const result = await label();
    console.log(result);
  } catch(error) {
    console.log(error);
  } finally {
    process.exit();
  }

}
