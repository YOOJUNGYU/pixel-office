/**
 * AUTO-GENERATED FROM core/asyncapi.yaml. DO NOT EDIT MANUALLY.
 *
 * Run `npm run asyncapi:generate` to regenerate.
 *
 * Source of truth: the yaml at core/asyncapi.yaml.
 * Editors and clients in any language can consume the spec directly.
 */

export type ServerMessage =
  | LayoutLoaded
  | LayoutSaved
  | LayoutSaveRejected
  | FurnitureAssetsLoaded
  | CharacterSpritesLoaded
  | PetSpritesLoaded
  | FloorTilesLoaded
  | WallTilesLoaded
  | CarpetTilesLoaded
  | OfficeAccess
  | SettingsLoaded
  | ExternalAssetDirectoriesUpdated
  | OfficeSnapshot
  | PeopleDirectory
  | ProfileLoaded
  | UpdateAvailable
  | UpdateStatus
  | AutostartState
  | RelayState
  | RelayKickResult
  | ArcadeTicketMessage
  | ArcadeResult
  | ArcadeBoard
  | OfficesState
  | OfficeCreated
  | OfficeCode
  | OfficeError
  | ProfileError
  | TranscriptLoaded
  | TranscriptEarlier
  | TranscriptAppend
  | TranscriptContext
  | TranscriptError
  | UsageNow
  | UsageLoaded;

export type ClientMessage =
  | WebviewReady
  | SaveLayout
  | SetAlwaysShowLabels
  | AddExternalAssetDirectory
  | RemoveExternalAssetDirectory
  | SaveProfile
  | InstallUpdate
  | CheckUpdate
  | SetAutostart
  | QuitApp
  | CreateOffice
  | JoinOffice
  | LeaveOffice
  | SetActiveView
  | GetOfficeCode
  | SendChat
  | DeleteChat
  | ArcadeStart
  | SubmitScore
  | OpenArcade
  | MoveAvatar
  | SetNotifications
  | OpenTranscript
  | LoadTranscriptBefore
  | CloseTranscript
  | SetRelayAdminToken
  | OpenUsage
  | CloseUsage
  | RelayKick;

export interface LayoutLoaded {
  type: 'layoutLoaded';
  layout: Record<string, any> | null;
  wasReset?: boolean;
}

export interface LayoutSaved {
  type: 'layoutSaved';
}

export interface LayoutSaveRejected {
  type: 'layoutSaveRejected';
}

export interface FurnitureAssetsLoaded {
  type: 'furnitureAssetsLoaded';
  catalog: FurnitureAssetMessage[];
  sprites: Record<string, string[][]>;
}

export interface FurnitureAssetMessage {
  id: string;
  name: string;
  label: string;
  category: string;
  file: string;
  width: number;
  height: number;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  canPlaceOnWalls: boolean;
  groupId?: string;
  canPlaceOnSurfaces?: boolean;
  backgroundTiles?: number;
  orientation?: string;
  state?: string;
  mirrorSide?: boolean;
  rotationScheme?: string;
  animationGroup?: string;
  frame?: number;
}

export interface CharacterSpritesLoaded {
  type: 'characterSpritesLoaded';
  characters: CharacterSpriteSet[];
}

export interface CharacterSpriteSet {
  down: string[][][];
  up: string[][][];
  right: string[][][];
}

export interface PetSpritesLoaded {
  type: 'petSpritesLoaded';
  pets: PetSpriteFrameSet[];
  petNames: string[];
  petIds: string[];
}

export interface PetSpriteFrameSet {
  walkDown: string[][][];
  idleDown: string[][][];
  walkUp: string[][][];
  idleUp: string[][][];
  walkRight: string[][][];
}

export interface FloorTilesLoaded {
  type: 'floorTilesLoaded';
  sprites: string[][][];
}

export interface WallTilesLoaded {
  type: 'wallTilesLoaded';
  sets: string[][][][];
}

export interface CarpetTilesLoaded {
  type: 'carpetTilesLoaded';
  sets: string[][][][];
}

export interface OfficeAccess {
  type: 'officeAccess';
  readOnly: boolean;
  version?: string;
}

export interface SettingsLoaded {
  type: 'settingsLoaded';
  alwaysShowLabels: boolean;
  externalAssetDirectories: string[];
  notifyPresence: boolean;
  notifyAgents: boolean;
  notifyChat: boolean;
  relayAdmin: boolean;
}

export interface ExternalAssetDirectoriesUpdated {
  type: 'externalAssetDirectoriesUpdated';
  dirs: string[];
}

export interface OfficeSnapshot {
  type: 'officeSnapshot';
  agents: OfficeAgentMessage[];
  people: OfficePersonMessage[];
  selfPeerId: string;
}

export interface OfficeAgentMessage {
  key: string;
  parentKey?: string;
  id: string;
  provider: AgentProvider;
  kind: AgentViewKind;
  num: number;
  parentId?: string;
  room: AgentRoom;
  permission: boolean;
  act: AgentAct;
  target: string;
  reason: string;
  hidden?: boolean;
  quiet?: boolean;
  zone?: AgentServerZone;
  talk?: boolean;
  ageSec?: number;
  todo?: AgentTodo;
  fail?: boolean;
  diff?: AgentDiff;
  heat?: AgentHeat;
  ctx?: AgentContext;
  title?: string;
  usage?: AgentUsage;
  peer: PeerInfoMessage;
}

export type AgentProvider = 'claude' | 'codex';

export type AgentViewKind = 'main' | 'subagent' | 'shell';

export type AgentRoom = 'coding' | 'library' | 'server' | 'lounge';

export type AgentAct =
  | 'idle'
  | 'edit'
  | 'read'
  | 'search'
  | 'find'
  | 'web'
  | 'fetch'
  | 'mcp'
  | 'run'
  | 'delegate'
  | 'ask'
  | 'image'
  | 'tool';

export type AgentServerZone = 'test' | 'build' | 'git' | 'run';

export interface AgentTodo {
  done: number;
  total: number;
}

export interface AgentDiff {
  add: number;
  del: number;
}

export interface AgentHeat {
  size: number;
  burn: number;
}

export interface AgentContext {
  used: number;
  window: number;
}

export interface AgentUsage {
  tokens: number;
  rate: number;
  model?: string;
  sum?: number;
  big?: AgentUsageBig;
}

export interface AgentUsageBig {
  n: number;
  last: number;
}

export interface PeerInfoMessage {
  id: string;
  account: string;
  nickname: string;
  nickSince?: number;
  palette: number;
  hueShift: number;
  pet?: PetId;
  tagColors?: TagColors;
  ver?: string;
}

export type PetId = 'claudio' | 'gitcat';

export interface TagColors {
  bg: string;
  fg: string;
}

export interface OfficePersonMessage {
  peerId: string;
  account: string;
  nickname: string;
  nickSince?: number;
  palette: number;
  hueShift: number;
  pet?: PetId;
  tagColors?: TagColors;
  ver?: string;
  net?: string;
  via?: ConnPath;
  self: boolean;
  chat?: ChatMessage;
  avatar?: AvatarMessage;
}

export type ConnPath = 'lan' | 'relay';

export interface ChatMessage {
  id: string;
  text: string;
}

export interface AvatarMessage {
  col: number;
  row: number;
  dir: AvatarDir;
}

export type AvatarDir = 'down' | 'up' | 'left' | 'right';

export interface PeopleDirectory {
  type: 'peopleDirectory';
  public: DirectoryPersonMessage[];
  teams: DirectoryTeamMessage[];
  personal: DirectoryPersonMessage[];
}

export interface DirectoryPersonMessage {
  peerId: string;
  account: string;
  nickname: string;
  nickSince?: number;
  palette: number;
  hueShift: number;
  pet?: PetId;
  tagColors?: TagColors;
  ver?: string;
  net?: string;
  via?: ConnPath;
  self: boolean;
}

export interface DirectoryTeamMessage {
  tag: string;
  name: string;
  people: DirectoryPersonMessage[];
}

export interface ProfileLoaded {
  type: 'profileLoaded';
  profile: ProfileMessage;
  canEdit: boolean;
  account: string;
  firstRun: boolean;
}

export interface ProfileMessage {
  nickname: string;
  palette: number;
  hueShift: number;
  pet?: PetId;
  tagColors?: TagColors;
  manualPeers: string[];
}

export interface UpdateAvailable {
  type: 'updateAvailable';
  version: string;
  notesUrl: string;
}

export interface UpdateStatus {
  type: 'updateStatus';
  state: UpdateState;
  percent?: number;
}

export type UpdateState = 'upToDate' | 'downloading' | 'installing' | 'error';

export interface AutostartState {
  type: 'autostartState';
  enabled: boolean;
  supported: boolean;
}

export interface RelayState {
  type: 'relayState';
  state: RelayStateKind;
  retryInMs?: number;
}

export type RelayStateKind =
  'off' | 'connecting' | 'connected' | 'full' | 'budget' | 'kicked' | 'error';

export interface RelayKickResult {
  type: 'relayKickResult';
  ok: boolean;
  reason?: RelayKickReason;
}

export type RelayKickReason = 'auth' | 'network' | 'bad' | 'noToken';

export interface ArcadeTicketMessage {
  type: 'arcadeTicket';
  game: GameId;
  req: number;
  ticket?: ArcadeTicket;
}

export type GameId = 'cable' | 'bugs' | 'breaker' | 'drone' | 'merge';

export interface ArcadeTicket {
  seed: number;
  issued: number;
  sig: string;
}

export interface ArcadeResult {
  type: 'arcadeResult';
  game: GameId;
  ok: boolean;
  score?: number;
  best?: number;
  rank?: number;
  reason?: ArcadeRefusal;
}

export type ArcadeRefusal = 'network' | 'bad' | 'sig' | 'expired' | 'used' | 'replay' | 'time';

export interface ArcadeBoard {
  type: 'arcadeBoard';
  boards?: ArcadeBoards;
}

export interface ArcadeBoards {
  cable: ArcadeRow[];
  bugs: ArcadeRow[];
  breaker: ArcadeRow[];
  drone: ArcadeRow[];
  merge: ArcadeRow[];
}

export interface ArcadeRow {
  id: string;
  name: string;
  score: number;
  at: number;
}

export interface OfficesState {
  type: 'officesState';
  offices: OfficeSummary[];
  activeView: string;
}

export interface OfficeSummary {
  tag: string;
  name: string;
}

export interface OfficeCreated {
  type: 'officeCreated';
  tag: string;
  name: string;
  code: string;
}

export interface OfficeCode {
  type: 'officeCode';
  tag: string;
  code: string;
}

export interface OfficeError {
  type: 'officeError';
  reason: OfficeErrorReason;
}

export type OfficeErrorReason = 'invalidCode' | 'alreadyJoined' | 'nameInvalid';

export interface ProfileError {
  type: 'profileError';
  reason: ProfileErrorReason;
}

export type ProfileErrorReason = 'nicknameTaken';

export interface TranscriptLoaded {
  type: 'transcriptLoaded';
  id: string;
  info: TranscriptInfo;
  entries: TranscriptEntry[];
  start: number;
  more: boolean;
}

export interface TranscriptInfo {
  kind: AgentViewKind;
  provider: AgentProvider;
  num: number;
  title: string;
  folder: string;
}

export interface TranscriptEntry {
  kind: TranscriptKind;
  text: string;
  ts?: string;
  tool?: string;
  callId?: string;
  error?: boolean;
  clipped?: number;
}

export type TranscriptKind = 'user' | 'assistant' | 'thinking' | 'tool' | 'result' | 'meta';

export interface TranscriptEarlier {
  type: 'transcriptEarlier';
  id: string;
  entries: TranscriptEntry[];
  start: number;
  more: boolean;
}

export interface TranscriptAppend {
  type: 'transcriptAppend';
  id: string;
  entries: TranscriptEntry[];
}

export interface TranscriptContext {
  type: 'transcriptContext';
  id: string;
  used: number;
  window: number;
}

export interface TranscriptError {
  type: 'transcriptError';
  id: string;
  reason: TranscriptErrorReason;
}

export type TranscriptErrorReason = 'notFound' | 'unreadable' | 'ended';

export interface UsageNow {
  type: 'usageNow';
  today: number;
  scanning: boolean;
}

export interface UsageLoaded {
  type: 'usageLoaded';
  range: UsageRange;
  scanning: boolean;
  totals: UsageTotals;
  days: UsageDay[];
  projects: UsageProject[];
  models: UsageModel[];
  providers: UsageProvider[];
  top: UsageTopSession[];
}

export type UsageRange = '7d' | '30d' | 'all';

export interface UsageTotals {
  billable: number;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
  sessions: number;
}

export interface UsageDay {
  day: string;
  input: number;
  output: number;
  cacheCreate: number;
  cacheRead: number;
}

export interface UsageProject {
  name: string;
  billable: number;
}

export interface UsageModel {
  model: string;
  billable: number;
}

export interface UsageProvider {
  provider: string;
  billable: number;
}

export interface UsageTopSession {
  key: string;
  provider: string;
  title: string;
  folder: string;
  lastTs: number;
  billable: number;
  exists: boolean;
}

export interface WebviewReady {
  type: 'webviewReady';
}

export interface SaveLayout {
  type: 'saveLayout';
  layout: Record<string, any>;
}

export interface SetAlwaysShowLabels {
  type: 'setAlwaysShowLabels';
  enabled: boolean;
}

export interface AddExternalAssetDirectory {
  type: 'addExternalAssetDirectory';
  path?: string;
}

export interface RemoveExternalAssetDirectory {
  type: 'removeExternalAssetDirectory';
  path: string;
}

export interface SaveProfile {
  type: 'saveProfile';
  profile: ProfileMessage;
}

export interface InstallUpdate {
  type: 'installUpdate';
}

export interface CheckUpdate {
  type: 'checkUpdate';
}

export interface SetAutostart {
  type: 'setAutostart';
  enabled: boolean;
}

export interface QuitApp {
  type: 'quitApp';
}

export interface CreateOffice {
  type: 'createOffice';
  name: string;
}

export interface JoinOffice {
  type: 'joinOffice';
  code: string;
  name?: string;
}

export interface LeaveOffice {
  type: 'leaveOffice';
  tag: string;
}

export interface SetActiveView {
  type: 'setActiveView';
  view: string;
}

export interface GetOfficeCode {
  type: 'getOfficeCode';
  tag: string;
}

export interface SendChat {
  type: 'sendChat';
  text: string;
}

export interface DeleteChat {
  type: 'deleteChat';
}

export interface ArcadeStart {
  type: 'arcadeStart';
  game: GameId;
  req: number;
}

export interface SubmitScore {
  type: 'submitScore';
  game: GameId;
  ticket: ArcadeTicket;
  inputs: number[];
}

export interface OpenArcade {
  type: 'openArcade';
}

export interface MoveAvatar {
  type: 'moveAvatar';
  col: number;
  row: number;
  dir: AvatarDir;
}

export interface SetNotifications {
  type: 'setNotifications';
  presence?: boolean;
  agents?: boolean;
  chat?: boolean;
}

export interface OpenTranscript {
  type: 'openTranscript';
  id: string;
}

export interface LoadTranscriptBefore {
  type: 'loadTranscriptBefore';
  id: string;
  before: number;
}

export interface CloseTranscript {
  type: 'closeTranscript';
  id?: string;
}

export interface SetRelayAdminToken {
  type: 'setRelayAdminToken';
  token: string;
}

export interface OpenUsage {
  type: 'openUsage';
  range: UsageRange;
}

export interface CloseUsage {
  type: 'closeUsage';
}

export interface RelayKick {
  type: 'relayKick';
  peerId: string;
}
