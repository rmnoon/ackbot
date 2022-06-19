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
    text: string; // "<@U0LAN0Z89> is it everything a river should be?",
    ts: string; // "1515449522.000016",
    channel: string; // "C0LAN2Q65",
    event_ts: string; // "1515449522000016"
}
