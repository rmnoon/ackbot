
export interface AckRequest {
    channel: string;
    ts: string;
    thread_ts: string;
    userIds: string[];
    userGroupIds: string[];
}
