export type TZabbixHost = {
  host: string;
  hostId: string;
};

export enum ZabbixSyncScope {
  Host = "host",
  Global = "global"
}

export enum ZabbixMacroType {
  Text = 0,
  Secret = 1
}

export const ZABBIX_SYNC_SCOPES = {
  [ZabbixSyncScope.Host]: {
    name: "호스트",
    description: "시크릿을 Zabbix의 특정 호스트로 동기화합니다."
  },
  [ZabbixSyncScope.Global]: {
    name: "전역",
    description: "시크릿을 Zabbix 전역 범위로 동기화합니다."
  }
};
