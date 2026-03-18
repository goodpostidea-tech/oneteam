export type ProposalSource = 'api' | 'trigger' | 'reaction' | 'initiative';

export type ProposalStatus = 'pending' | 'accepted' | 'rejected';
export type MissionStatus = 'approved' | 'running' | 'succeeded' | 'failed';
export type StepStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type StepKind =
  | 'draft_social'
  | 'write_article'
  | 'crawl'
  | 'analyze'
  | 'roundtable';

