export type SlackRequest = UrlVerificationRequest | EventCallbackRequest;

export interface UrlVerificationRequest {
    type: 'url_verification';
    challenge: string;
}

export interface EventCallbackRequest {
    type: 'event_callback';
    event: AnyEvent;
}

export type AnyEvent = AppMentionEvent | ReactionAddedEvent | ReactionRemovedEvent;

interface BaseEvent<T extends string> {
    type: T;
    event_ts: string; // "1655690131.397519"
}

/** https://api.slack.com/events/app_mention */
export interface AppMentionEvent extends BaseEvent<'app_mention'> {
    user: string; // "U061F7AUR",
    ts: string; // "1515449522.000016",
    channel: string; // "UE3Q82Q2Y",
    text: string; // "<@U0LAN0Z89> is it everything a river should be?",
    blocks: Block[];
    client_msg_id: string;
    team: string;
    parent_user_id: string; // "UE3Q82Q2Y",
    thread_ts: string; // "1655690126.229199"
}

interface BaseReactionEvent<T extends string> extends BaseEvent<T> {
    user: string; // "U061F7AUR",
    reaction: string; // "thumbsup",
    item_user: string; // "U0G9QF9C6",
    item: {
        type: 'message',  // ?
        channel: string; // "C0G9QF9GZ",
        ts: string; // "1360782400.498405"
    },
    event_ts: string; // "1360782804.083113"
}

export interface ReactionAddedEvent extends BaseReactionEvent<'reaction_added'> {
}

export interface ReactionRemovedEvent extends BaseReactionEvent<'reaction_removed'> {
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