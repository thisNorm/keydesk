import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum VenafiConnectionMethod {
  ApiKey = "api-key"
}

export enum VenafiRegion {
  US = "us",
  EU = "eu",
  AU = "au",
  UK = "uk",
  SG = "sg",
  CA = "ca"
}

export const VENAFI_REGION_LABELS: Record<VenafiRegion, string> = {
  [VenafiRegion.US]: "US",
  [VenafiRegion.EU]: "EU",
  [VenafiRegion.AU]: "호주",
  [VenafiRegion.UK]: "UK",
  [VenafiRegion.SG]: "싱가포르",
  [VenafiRegion.CA]: "캐나다"
};

export type TVenafiConnection = TRootAppConnection & { app: AppConnection.Venafi } & {
  method: VenafiConnectionMethod.ApiKey;
  credentials: {
    apiKey: string;
    region: VenafiRegion;
  };
};
