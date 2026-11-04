export type KnowledgeSection = { id: string; title: string; body: string; kind?: 'section' | 'reference' };
export type Embassy = { country: string; phone: string; address: string; region: string };
export type GuideApp = { id: string; name: string; store_search: string };
export type GuideTopic = { id: string; emoji: string; title: string; starter: string };

/** The guide's content as stored in the guide_* tables. */
export type GuideContent = { sections: KnowledgeSection[]; embassies: Embassy[]; apps: GuideApp[] };
