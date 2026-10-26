export type TTerraformCloudOrganization = {
  name: string;
  id: string;
  variableSets: TTerraformCloudVariableSet[];
  workspaces: TTerraformCloudWorkspace[];
};

export type TTerraformCloudVariableSet = {
  id: string;
  name: string;
};

export type TTerraformCloudWorkspace = {
  id: string;
  name: string;
};

export type TTerraformCloudConnectionOrganization = {
  id: string;
  name: string;
  variableSets: TTerraformCloudConnectionVariableSet[];
  workspaces: TTerraformCloudConnectionWorkspace[];
};

export type TTerraformCloudConnectionVariableSet = {
  id: string;
  name: string;
  description: string;
  global: boolean;
};

export type TTerraformCloudConnectionWorkspace = {
  id: string;
  name: string;
};

export enum TerraformCloudSyncScope {
  VariableSet = "variable-set",
  Workspace = "workspace"
}

export enum TerraformCloudSyncCategory {
  Environment = "env",
  Terraform = "terraform"
}

export const TERRAFORM_CLOUD_SYNC_SCOPES = {
  [TerraformCloudSyncScope.VariableSet]: {
    name: "변수 집합",
    description: "시크릿을 Terraform Cloud의 특정 변수 집합으로 동기화합니다."
  },
  [TerraformCloudSyncScope.Workspace]: {
    name: "워크스페이스",
    description: "시크릿을 Terraform Cloud의 특정 워크스페이스로 동기화합니다."
  }
};
