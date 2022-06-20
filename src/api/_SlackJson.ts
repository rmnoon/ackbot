export type SlackRequest = UrlVerificationRequest | EventCallbackRequest;

export interface UrlVerificationRequest {
    type: 'url_verification';
    challenge: string;
}

export interface EventCallbackRequest {
    type: 'event_callback';
    event: AppMentionEvent;
}

/** https://api.slack.com/events/app_mention */
export interface AppMentionEvent {
    type: 'app_mention';
    user: string; // "U061F7AUR",
    ts: string; // "1515449522.000016",
    channel: string; // "UE3Q82Q2Y",
    event_ts: string; // "1655690131.397519"
    text: string; // "<@U0LAN0Z89> is it everything a river should be?",
    blocks: Block[];
    client_msg_id: string;
    team: string;
    parent_user_id: string; // "UE3Q82Q2Y",
    thread_ts: string; // "1655690126.229199"
}

export type Block = RichTextBlock | RichTextSectionBlock | UserBlock | TextBlock | UserGroupBlock;

export interface RichTextBlock {
    type: 'rich_text';
    block_id: string;
    elements: Block[];
}

export interface RichTextSectionBlock {
    type: 'rich_text_section';
    elements: Block[];
}

export interface UserBlock {
    type: 'user';
    user_id: string;
}

export interface TextBlock {
    type: 'text';
    text: string;
}

export interface UserGroupBlock {
    type: 'usergroup';
    usergroup_id: string;
}