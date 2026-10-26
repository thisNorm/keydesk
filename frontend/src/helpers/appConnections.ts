import { useRouterState } from "@tanstack/react-router";
import {
  FileBadgeIcon,
  GithubIcon,
  IdCardIcon,
  KeyRoundIcon,
  LinkIcon,
  LockIcon,
  LucideIcon,
  RadarIcon,
  ServerIcon,
  UserIcon
} from "lucide-react";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  Auth0ConnectionMethod,
  AwsConnectionMethod,
  AzureADCSConnectionMethod,
  AzureAppConfigurationConnectionMethod,
  AzureClientSecretsConnectionMethod,
  AzureDevOpsConnectionMethod,
  AzureKeyVaultConnectionMethod,
  CamundaConnectionMethod,
  CloudflareConnectionMethod,
  DatabricksConnectionMethod,
  DaytonaConnectionMethod,
  DbtConnectionMethod,
  DevinConnectionMethod,
  FlyioConnectionMethod,
  GcpConnectionMethod,
  GitHubConnectionMethod,
  GitHubRadarConnectionMethod,
  GitLabConnectionMethod,
  HCVaultConnectionMethod,
  HumanitecConnectionMethod,
  LdapConnectionMethod,
  MongoDBConnectionMethod,
  MsSqlConnectionMethod,
  MySqlConnectionMethod,
  OctopusDeployConnectionMethod,
  OktaConnectionMethod,
  OnePassConnectionMethod,
  OracleDBConnectionMethod,
  PostgresConnectionMethod,
  QoveryConnectionMethod,
  RedisConnectionMethod,
  TAppConnection,
  TeamCityConnectionMethod,
  TerraformCloudConnectionMethod,
  VercelConnectionMethod,
  WindmillConnectionMethod,
  ZabbixConnectionMethod
} from "@app/hooks/api/appConnections/types";
import { AdcsConnectionMethod } from "@app/hooks/api/appConnections/types/adcs-connection";
import { AnthropicConnectionMethod } from "@app/hooks/api/appConnections/types/anthropic-connection";
import { AzureDNSConnectionMethod } from "@app/hooks/api/appConnections/types/azure-dns-connection";
import { AzureEntraIdConnectionMethod } from "@app/hooks/api/appConnections/types/azure-entra-id-connection";
import { BitbucketConnectionMethod } from "@app/hooks/api/appConnections/types/bitbucket-connection";
import { ChecklyConnectionMethod } from "@app/hooks/api/appConnections/types/checkly-connection";
import { ChefConnectionMethod } from "@app/hooks/api/appConnections/types/chef-connection";
import { CircleCIConnectionMethod } from "@app/hooks/api/appConnections/types/circleci-connection";
import { Cloud66ConnectionMethod } from "@app/hooks/api/appConnections/types/cloud-66-connection";
import { ConvexConnectionMethod } from "@app/hooks/api/appConnections/types/convex-connection";
import { DatadogConnectionMethod } from "@app/hooks/api/appConnections/types/datadog-connection";
import { DigiCertConnectionMethod } from "@app/hooks/api/appConnections/types/digicert-connection";
import { DigitalOceanConnectionMethod } from "@app/hooks/api/appConnections/types/digital-ocean";
import { DNSMadeEasyConnectionMethod } from "@app/hooks/api/appConnections/types/dns-made-easy-connection";
import { DopplerConnectionMethod } from "@app/hooks/api/appConnections/types/doppler-connection";
import { ExternalInfisicalConnectionMethod } from "@app/hooks/api/appConnections/types/external-infisical-connection";
import { F5BigIpConnectionMethod } from "@app/hooks/api/appConnections/types/f5-big-ip-connection";
import { FireworksConnectionMethod } from "@app/hooks/api/appConnections/types/fireworks-connection";
import { GoDaddyConnectionMethod } from "@app/hooks/api/appConnections/types/godaddy-connection";
import { HasuraCloudConnectionMethod } from "@app/hooks/api/appConnections/types/hasura-cloud-connection";
import { HerokuConnectionMethod } from "@app/hooks/api/appConnections/types/heroku-connection";
import { HpeIloConnectionMethod } from "@app/hooks/api/appConnections/types/hpe-ilo-connection";
import { KeeperConnectionMethod } from "@app/hooks/api/appConnections/types/keeper-connection";
import { KempLoadMasterConnectionMethod } from "@app/hooks/api/appConnections/types/kemp-loadmaster-connection";
import { LaravelForgeConnectionMethod } from "@app/hooks/api/appConnections/types/laravel-forge-connection";
import { LiteLLMConnectionMethod } from "@app/hooks/api/appConnections/types/litellm-connection";
import { MicrosoftIntuneConnectionMethod } from "@app/hooks/api/appConnections/types/microsoft-intune-connection";
import { NetlifyConnectionMethod } from "@app/hooks/api/appConnections/types/netlify-connection";
import { NetScalerConnectionMethod } from "@app/hooks/api/appConnections/types/netscaler-connection";
import { NorthflankConnectionMethod } from "@app/hooks/api/appConnections/types/northflank-connection";
import { NutanixPrismCentralConnectionMethod } from "@app/hooks/api/appConnections/types/nutanix-prism-central-connection";
import { OCIConnectionMethod } from "@app/hooks/api/appConnections/types/oci-connection";
import { OnaConnectionMethod } from "@app/hooks/api/appConnections/types/ona-connection";
import { OpenAIConnectionMethod } from "@app/hooks/api/appConnections/types/open-ai-connection";
import { OpenRouterConnectionMethod } from "@app/hooks/api/appConnections/types/open-router-connection";
import { OVHConnectionMethod } from "@app/hooks/api/appConnections/types/ovh-connection";
import { PaloAltoNetworksConnectionMethod } from "@app/hooks/api/appConnections/types/palo-alto-networks-connection";
import { PortainerConnectionMethod } from "@app/hooks/api/appConnections/types/portainer-connection";
import { PowerDnsConnectionMethod } from "@app/hooks/api/appConnections/types/powerdns-connection";
import { RailwayConnectionMethod } from "@app/hooks/api/appConnections/types/railway-connection";
import { RenderConnectionMethod } from "@app/hooks/api/appConnections/types/render-connection";
import { RundeckConnectionMethod } from "@app/hooks/api/appConnections/types/rundeck-connection";
import { S3CompatibleConnectionMethod } from "@app/hooks/api/appConnections/types/s3-compatible-connection";
import { SalesforceConnectionMethod } from "@app/hooks/api/appConnections/types/salesforce-connection";
import { SmbConnectionMethod } from "@app/hooks/api/appConnections/types/smb-connection";
import { SnowflakeConnectionMethod } from "@app/hooks/api/appConnections/types/snowflake-connection";
import { SpaceliftConnectionMethod } from "@app/hooks/api/appConnections/types/spacelift-connection";
import { SshConnectionMethod } from "@app/hooks/api/appConnections/types/ssh-connection";
import { StripeConnectionMethod } from "@app/hooks/api/appConnections/types/stripe-connection";
import { SupabaseConnectionMethod } from "@app/hooks/api/appConnections/types/supabase-connection";
import { TravisCIConnectionMethod } from "@app/hooks/api/appConnections/types/travis-ci-connection";
import { TriggerDevConnectionMethod } from "@app/hooks/api/appConnections/types/trigger-dev-connection";
import { UltraDNSConnectionMethod } from "@app/hooks/api/appConnections/types/ultradns-connection";
import { VenafiConnectionMethod } from "@app/hooks/api/appConnections/types/venafi-connection";
import { VenafiTppConnectionMethod } from "@app/hooks/api/appConnections/types/venafi-tpp-connection";
import { WinRMConnectionMethod } from "@app/hooks/api/appConnections/types/winrm-connection";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const APP_CONNECTION_MAP: Record<
  AppConnection,
  {
    name: string;
    image: string;
    category: string;
    description: string;
    size?: number;
    icon?: LucideIcon;
    enterprise?: boolean;
    aliases?: string[];
  }
> = {
  [AppConnection.AWS]: {
    name: "AWS",
    image: "Amazon Web Services.png",
    category: "AWS",
    description: "IAM 액세스 키 또는 역할 수임으로 연결합니다."
  },
  [AppConnection.GitHub]: {
    name: "GitHub",
    image: "GitHub.png",
    category: "버전 관리",
    description: "GitHub App, OAuth 또는 개인 액세스 토큰으로 인증합니다."
  },
  [AppConnection.GitHubRadar]: {
    name: "GitHub Radar",
    image: "GitHub.png",
    icon: RadarIcon,
    category: "보안",
    description: "시크릿 스캔에 사용하는 GitHub App 연결입니다."
  },
  [AppConnection.GCP]: {
    name: "GCP",
    image: "Google Cloud Platform.png",
    category: "Google Cloud",
    description: "서비스 계정 가장으로 인증합니다."
  },
  [AppConnection.AzureKeyVault]: {
    name: "Azure Key Vault",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "클라우드에서 키, 시크릿, 인증서를 관리합니다."
  },
  [AppConnection.AzureAppConfiguration]: {
    name: "Azure App Configuration",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Azure에서 애플리케이션 설정을 중앙 관리합니다."
  },
  [AppConnection.AzureClientSecrets]: {
    name: "Azure Client Secrets",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Entra ID 애플리케이션의 클라이언트 시크릿을 관리합니다."
  },
  [AppConnection.AzureDevOps]: {
    name: "Azure DevOps",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Azure DevOps 파이프라인과 프로젝트에 접근합니다."
  },
  [AppConnection.AzureADCS]: {
    name: "Azure ADCS (Web Enrollment)",
    image: "Microsoft Azure.png",
    category: "인증서",
    description: "HTTPS를 통해 ADCS Web Enrollment에서 인증서를 발급합니다."
  },
  [AppConnection.ADCS]: {
    name: "Microsoft ADCS",
    image: "Windows.png",
    category: "인증서",
    description: "게이트웨이를 통해 Active Directory Certificate Services에서 인증서를 발급합니다."
  },
  [AppConnection.AzureDNS]: {
    name: "Azure DNS",
    image: "Microsoft Azure.png",
    category: "AZURE",
    description: "Azure의 DNS 영역과 레코드를 관리합니다."
  },
  [AppConnection.Databricks]: {
    name: "Databricks",
    image: "Databricks.png",
    category: "데이터",
    description: "작업, 노트북, 시크릿을 위한 Databricks 워크스페이스에 접근합니다."
  },
  [AppConnection.Humanitec]: {
    name: "Humanitec",
    image: "Humanitec.png",
    category: "플랫폼",
    description: "애플리케이션 구성을 위한 플랫폼 오케스트레이터입니다."
  },
  [AppConnection.TerraformCloud]: {
    name: "Terraform Cloud",
    image: "Terraform Cloud.png",
    category: "인프라",
    description: "Terraform Cloud 워크스페이스의 변수를 관리합니다."
  },
  [AppConnection.Vercel]: {
    name: "Vercel",
    image: "Vercel.png",
    category: "호스팅",
    description: "Vercel 프로젝트와 환경에 접근합니다."
  },
  [AppConnection.Postgres]: {
    name: "PostgreSQL",
    image: "Postgres.png",
    category: "데이터베이스",
    description: "PostgreSQL 데이터베이스에 연결합니다."
  },
  [AppConnection.MsSql]: {
    name: "Microsoft SQL Server",
    image: "MsSql.png",
    category: "데이터베이스",
    description: "Microsoft SQL Server 데이터베이스에 연결합니다."
  },
  [AppConnection.MySql]: {
    name: "MySQL",
    image: "MySql.png",
    category: "데이터베이스",
    description: "MySQL 데이터베이스에 연결합니다."
  },
  [AppConnection.OracleDB]: {
    name: "OracleDB",
    image: "Oracle.png",
    enterprise: true,
    category: "데이터베이스",
    description: "Oracle 데이터베이스에 연결합니다."
  },
  [AppConnection.Camunda]: {
    name: "Camunda",
    image: "Camunda.png",
    category: "플랫폼",
    description: "Camunda 8 클러스터와 클라이언트에 접근합니다."
  },
  [AppConnection.Windmill]: {
    name: "Windmill",
    image: "Windmill.png",
    category: "플랫폼",
    description: "Windmill 스크립트와 플로를 위한 워크스페이스에 접근합니다."
  },
  [AppConnection.Auth0]: {
    name: "Auth0",
    image: "Auth0.png",
    size: 40,
    category: "ID 관리",
    description: "클라이언트 인증 정보로 Auth0 테넌트를 관리합니다."
  },
  [AppConnection.HCVault]: {
    name: "Hashicorp Vault",
    image: "Vault.png",
    size: 65,
    category: "시크릿 관리자",
    description: "직접 관리하는 HashiCorp Vault에 연결합니다."
  },
  [AppConnection.LDAP]: {
    name: "LDAP",
    image: "LDAP.png",
    size: 65,
    category: "ID 관리",
    description: "LDAP 디렉터리 서버에 바인딩합니다."
  },
  [AppConnection.TeamCity]: {
    name: "TeamCity",
    image: "TeamCity.png",
    category: "CI/CD",
    description: "JetBrains TeamCity 프로젝트와 빌드에 접근합니다."
  },
  [AppConnection.OCI]: {
    name: "OCI",
    image: "Oracle.png",
    enterprise: true,
    category: "Oracle Cloud",
    description: "Oracle Cloud Infrastructure에 인증합니다."
  },
  [AppConnection.OnePass]: {
    name: "1Password",
    image: "1Password.png",
    category: "비밀번호 관리자",
    description: "1Password 보관함의 항목을 읽고 관리합니다."
  },
  [AppConnection.Keeper]: {
    name: "Keeper",
    image: "Keeper.png",
    category: "비밀번호 관리자",
    description: "Keeper Commander 서비스 모드에 연결합니다."
  },
  [AppConnection.Heroku]: {
    name: "Heroku",
    image: "Heroku.png",
    category: "호스팅",
    description: "Heroku 앱과 구성 변수에 접근합니다."
  },
  [AppConnection.Stripe]: {
    name: "Stripe",
    image: "Stripe.svg",
    category: "플랫폼",
    description: "Stripe API 키를 관리합니다."
  },
  [AppConnection.Render]: {
    name: "Render",
    image: "Render.png",
    category: "호스팅",
    description: "Render 서비스와 환경에 접근합니다."
  },
  [AppConnection.Flyio]: {
    name: "Fly.io",
    image: "Flyio.svg",
    category: "호스팅",
    description: "Fly.io 앱과 시크릿에 접근합니다."
  },
  [AppConnection.GitLab]: {
    name: "GitLab",
    image: "GitLab.png",
    category: "버전 관리",
    description: "OAuth 또는 액세스 토큰으로 인증합니다."
  },
  [AppConnection.Cloudflare]: {
    name: "Cloudflare",
    image: "Cloudflare.png",
    category: "네트워크",
    description: "API 토큰으로 Cloudflare 계정 리소스를 관리합니다."
  },
  [AppConnection.DNSMadeEasy]: {
    name: "DNS Made Easy",
    image: "DNSMadeEasy.svg",
    size: 120,
    category: "DNS",
    description: "DNS Made Easy의 DNS 레코드를 관리합니다."
  },
  [AppConnection.PowerDns]: {
    name: "PowerDNS",
    image: "PowerDNS.png",
    category: "DNS",
    description: "직접 호스팅하는 PowerDNS 서버의 DNS 레코드를 관리합니다."
  },
  [AppConnection.UltraDNS]: {
    name: "UltraDNS",
    image: "UltraDNS.png",
    category: "DNS",
    description: "UltraDNS의 DNS 레코드를 관리합니다."
  },
  [AppConnection.Zabbix]: {
    name: "Zabbix",
    image: "Zabbix.png",
    category: "모니터링",
    description: "Zabbix 모니터링과 호스트에 접근합니다."
  },
  [AppConnection.Railway]: {
    name: "Railway",
    image: "Railway.png",
    category: "호스팅",
    description: "Railway 프로젝트와 환경에 접근합니다."
  },
  [AppConnection.Bitbucket]: {
    name: "Bitbucket",
    image: "Bitbucket.png",
    category: "버전 관리",
    description: "Bitbucket 저장소와 워크스페이스에 접근합니다."
  },
  [AppConnection.Checkly]: {
    name: "Checkly",
    image: "Checkly.png",
    category: "모니터링",
    description: "Checkly 합성 모니터링에 접근합니다."
  },
  [AppConnection.Supabase]: {
    name: "Supabase",
    image: "Supabase.png",
    category: "플랫폼",
    description: "Supabase 플랫폼의 프로젝트에 접근합니다."
  },
  [AppConnection.DigitalOcean]: {
    name: "Digital Ocean",
    image: "Digital Ocean.png",
    category: "클라우드",
    description: "DigitalOcean 계정과 리소스에 접근합니다."
  },
  [AppConnection.Netlify]: {
    name: "Netlify",
    image: "Netlify.png",
    category: "호스팅",
    description: "Netlify 사이트와 환경에 접근합니다."
  },
  [AppConnection.Northflank]: {
    name: "Northflank",
    image: "Northflank.png",
    category: "호스팅",
    description: "Northflank 프로젝트와 서비스에 접근합니다."
  },
  [AppConnection.Okta]: {
    name: "Okta",
    image: "Okta.png",
    category: "ID 관리",
    description: "API 토큰으로 Okta 조직을 관리합니다."
  },
  [AppConnection.Redis]: {
    name: "Redis",
    image: "Redis.png",
    category: "데이터베이스",
    description: "Redis 인스턴스에 연결합니다."
  },
  [AppConnection.MongoDB]: {
    name: "MongoDB",
    image: "MongoDB.png",
    category: "데이터베이스",
    description: "MongoDB 데이터베이스에 연결합니다."
  },
  [AppConnection.LaravelForge]: {
    name: "Laravel Forge",
    image: "Laravel Forge.png",
    size: 65,
    category: "호스팅",
    description: "Laravel Forge 서버와 사이트에 접근합니다."
  },
  [AppConnection.Chef]: {
    name: "Chef",
    image: "Chef.png",
    enterprise: true,
    category: "인프라",
    description: "Chef Infra 노드와 데이터 백에 접근합니다."
  },
  [AppConnection.OctopusDeploy]: {
    name: "Octopus Deploy",
    image: "Octopus Deploy.png",
    category: "CI/CD",
    description: "Octopus Deploy 프로젝트와 배포에 접근합니다."
  },
  [AppConnection.SSH]: {
    name: "SSH",
    image: "SSH.png",
    category: "인프라",
    description: "SSH로 호스트에 연결합니다."
  },
  [AppConnection.Dbt]: {
    name: "DBT",
    image: "DBT.png",
    category: "데이터",
    description: "dbt 계정과 작업에 접근합니다."
  },
  [AppConnection.SMB]: {
    name: "Windows (SMB)",
    image: "SMB.png",
    size: 50,
    category: "스토리지",
    description: "SMB/CIFS 파일 공유에 연결합니다."
  },
  [AppConnection.WinRM]: {
    name: "Windows (WinRM)",
    image: "Windows.png",
    category: "인프라",
    description: "게이트웨이를 통해 WinRM으로 Windows 호스트에 연결합니다."
  },
  [AppConnection.OpenRouter]: {
    name: "OpenRouter",
    image: "OpenRouter.png",
    category: "AI",
    description: "여러 LLM 공급자로 요청을 라우팅합니다."
  },
  [AppConnection.OpenAI]: {
    name: "OpenAI",
    image: "OpenAI.png",
    category: "AI",
    description: "OpenAI API 접근을 관리합니다."
  },
  [AppConnection.CircleCI]: {
    name: "CircleCI",
    image: "CircleCI.png",
    category: "CI/CD",
    description: "CircleCI 프로젝트와 파이프라인에 접근합니다."
  },
  [AppConnection.Cloud66]: {
    name: "Cloud 66",
    image: "Cloud 66.png",
    category: "호스팅",
    description: "Cloud 66 앱과 배포에 접근합니다."
  },
  [AppConnection.AzureEntraId]: {
    name: "Azure Entra ID",
    image: "Microsoft Azure.png",
    category: "ID 관리",
    description: "Entra ID의 사용자와 그룹을 관리합니다."
  },
  [AppConnection.MicrosoftIntune]: {
    name: "Microsoft Intune",
    image: "Microsoft Intune.svg",
    category: "인증서",
    enterprise: true,
    description: "Microsoft Intune으로 SCEP 인증서 요청을 검증합니다."
  },
  [AppConnection.Venafi]: {
    name: "Venafi TLS Protect Cloud",
    image: "Venafi.png",
    category: "인증서",
    description: "Venafi Cloud에서 인증서를 발급하고 관리합니다."
  },
  [AppConnection.VenafiTpp]: {
    name: "Venafi TPP",
    image: "Venafi.png",
    category: "인증서",
    description: "Venafi Trust Protection Platform에서 인증서를 발급합니다."
  },
  [AppConnection.ExternalInfisical]: {
    name: "Infisical",
    image: "Infisical.png",
    category: "시크릿 관리자",
    description: "외부 Infisical 인스턴스에 연결합니다."
  },
  [AppConnection.Doppler]: {
    name: "Doppler",
    image: "Doppler.png",
    category: "시크릿 관리자",
    description: "Doppler 프로젝트와 구성에 접근합니다."
  },
  [AppConnection.NetScaler]: {
    name: "NetScaler",
    image: "NetScaler.png",
    category: "네트워크",
    description: "Citrix NetScaler 장비를 관리합니다."
  },
  [AppConnection.PaloAltoNetworks]: {
    name: "Palo Alto Networks",
    image: "Palo Alto Networks.png",
    category: "네트워크",
    description: "Palo Alto Networks 방화벽 또는 Panorama에 연결합니다."
  },
  [AppConnection.KempLoadMaster]: {
    name: "Kemp LoadMaster",
    image: "Kemp LoadMaster.png",
    category: "네트워크",
    description: "Progress Kemp LoadMaster 로드 밸런서를 관리합니다."
  },
  [AppConnection.Anthropic]: {
    name: "Anthropic",
    image: "Anthropic.png",
    category: "AI",
    description: "Anthropic API 접근을 관리합니다."
  },
  [AppConnection.LiteLLM]: {
    name: "LiteLLM",
    image: "LiteLLM.png",
    category: "AI",
    description: "LiteLLM API 접근을 관리합니다."
  },
  [AppConnection.Fireworks]: {
    name: "Fireworks",
    image: "Fireworks.png",
    category: "AI",
    description: "Fireworks API 접근을 관리합니다."
  },
  [AppConnection.HasuraCloud]: {
    name: "Hasura Cloud",
    image: "Hasura.svg",
    category: "플랫폼",
    description: "Hasura Cloud의 GraphQL API와 데이터에 접근합니다."
  },
  [AppConnection.OVH]: {
    name: "OVH Cloud",
    image: "OVH.png",
    category: "클라우드",
    description: "OVHcloud 계정과 서비스에 접근합니다."
  },
  [AppConnection.Devin]: {
    name: "Devin",
    image: "Devin.png",
    size: 55,
    category: "AI",
    description: "Devin API 접근을 관리합니다."
  },
  [AppConnection.Ona]: {
    name: "Ona",
    image: "Ona.png",
    aliases: ["gitpod"],
    category: "플랫폼",
    description: "Ona(이전 Gitpod) 워크스페이스에 접근합니다."
  },
  [AppConnection.DigiCert]: {
    name: "DigiCert",
    image: "DigiCert.png",
    category: "인증서",
    description: "DigiCert에서 인증서를 발급하고 관리합니다."
  },
  [AppConnection.GoDaddy]: {
    name: "GoDaddy",
    image: "GoDaddy.png",
    category: "DNS",
    description: "GoDaddy의 DNS 레코드를 관리합니다."
  },
  [AppConnection.TravisCI]: {
    name: "Travis CI",
    image: "Travis CI.png",
    category: "CI/CD",
    description: "Travis CI 저장소와 빌드에 접근합니다."
  },
  [AppConnection.Salesforce]: {
    name: "Salesforce",
    image: "Salesforce.png",
    category: "CRM",
    description: "연결된 앱의 클라이언트 인증 정보로 조직에 접근합니다."
  },
  [AppConnection.Snowflake]: {
    name: "Snowflake",
    image: "Snowflake.png",
    category: "데이터",
    description: "Snowflake 데이터 웨어하우스에 연결합니다."
  },
  [AppConnection.Datadog]: {
    name: "Datadog",
    image: "DatadogWhite.png",
    category: "모니터링",
    description: "Datadog 지표와 모니터링에 접근합니다."
  },
  [AppConnection.F5BigIp]: {
    name: "F5 BIG-IP",
    image: "F5 BIG-IP.png",
    category: "네트워크",
    description: "F5 BIG-IP 장비를 관리합니다."
  },
  [AppConnection.HpeIloRedFish]: {
    name: "HPE iLO",
    image: "HPE iLO.png",
    category: "인프라",
    description: "Redfish API로 HPE iLO 서버를 관리합니다."
  },
  [AppConnection.Convex]: {
    name: "Convex",
    image: "Convex.png",
    category: "플랫폼",
    description: "Convex 프로젝트와 배포에 접근합니다."
  },
  [AppConnection.Qovery]: {
    name: "Qovery",
    image: "Qovery.png",
    category: "호스팅",
    description: "Qovery에서 애플리케이션을 배포하고 관리합니다."
  },
  [AppConnection.TriggerDev]: {
    name: "Trigger.dev",
    image: "TriggerDev.png",
    category: "인프라",
    description: "Trigger.dev에 접근합니다."
  },
  [AppConnection.Rundeck]: {
    name: "Rundeck",
    image: "Rundeck.svg",
    category: "인프라",
    description: "Rundeck 작업과 프로젝트에 접근합니다."
  },
  [AppConnection.Portainer]: {
    name: "Portainer",
    image: "Portainer.png",
    category: "인프라",
    description: "Portainer 스택과 환경에 접근합니다."
  },
  [AppConnection.NutanixPrismCentral]: {
    name: "Nutanix Prism Central",
    image: "Nutanix.png",
    category: "인프라",
    description: "Nutanix Prism Central 인스턴스를 관리합니다."
  },
  [AppConnection.Spacelift]: {
    name: "Spacelift",
    image: "Spacelift.png",
    category: "인프라",
    description: "Spacelift 리소스를 동기화하고 관리합니다."
  },
  [AppConnection.Daytona]: {
    name: "Daytona",
    image: "Daytona.png",
    category: "플랫폼",
    description: "Daytona 샌드박스의 조직 시크릿에 접근합니다."
  },
  [AppConnection.S3Compatible]: {
    name: "S3 호환 스토리지",
    image: "S3 Compatible.svg",
    aliases: ["aws s3", "cloudflare r2", "google cloud storage", "gcs", "oracle", "oci"],
    category: "스토리지",
    description: "AWS S3, Cloudflare R2, Google Cloud Storage 또는 OCI Object Storage에 연결합니다."
  }
};

const S3_COMPATIBLE_PROVIDERS = [
  { name: "AWS S3", hostname: /^s3\.[a-z0-9-]+\.amazonaws\.com$/ },
  { name: "Cloudflare R2", hostname: /^[a-f0-9]{32}(\.[a-z]+)?\.r2\.cloudflarestorage\.com$/ },
  { name: "Google Cloud Storage", hostname: /^storage\.googleapis\.com$/ },
  {
    name: "OCI Object Storage",
    hostname:
      /^[a-z0-9-]+\.compat\.objectstorage\.[a-z0-9-]+\.(oraclecloud\.com|oci\.customer-oci\.com)$/
  }
];

const STORAGE_HOSTNAME_REGEX = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$/;

export const isStorageHostname = (hostname: string) => {
  if (!STORAGE_HOSTNAME_REGEX.test(hostname)) return false;
  try {
    return new URL(`https://${hostname}`).host === hostname;
  } catch {
    return false;
  }
};

export const getS3CompatibleProviderName = (
  endpoint: string,
  allowedStorageHostnames: string[] = []
) => {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    const providerName = url.port
      ? undefined
      : S3_COMPATIBLE_PROVIDERS.find(({ hostname }) => hostname.test(url.hostname))?.name;
    if (providerName) return providerName;
    return allowedStorageHostnames.includes(url.host) ? url.host : null;
  } catch {
    return null;
  }
};

export const getAppConnectionProviderName = (connection: TAppConnection) =>
  (connection.app === AppConnection.S3Compatible &&
    getS3CompatibleProviderName(connection.credentials.endpoint)) ||
  APP_CONNECTION_MAP[connection.app].name;

export const POPULAR_APP_CONNECTIONS: AppConnection[] = [
  AppConnection.AWS,
  AppConnection.GitHub,
  AppConnection.GCP,
  AppConnection.AzureKeyVault,
  AppConnection.Postgres,
  AppConnection.Vercel
];

export const getAppConnectionMethodDetails = (method: TAppConnection["method"]) => {
  switch (method) {
    case GitHubConnectionMethod.App:
    case GitHubRadarConnectionMethod.App:
      return { name: "GitHub App", icon: GithubIcon };
    case GitHubConnectionMethod.Pat:
    case OnaConnectionMethod.PersonalAccessToken:
      return { name: "개인 액세스 토큰", icon: KeyRoundIcon };
    case AzureKeyVaultConnectionMethod.OAuth:
    case AzureAppConfigurationConnectionMethod.OAuth:
    case AzureClientSecretsConnectionMethod.OAuth:
    case AzureDevOpsConnectionMethod.OAuth:
    case GitHubConnectionMethod.OAuth:
    case HerokuConnectionMethod.OAuth:
    case GitLabConnectionMethod.OAuth:
    case VenafiTppConnectionMethod.OAuth:
    case StripeConnectionMethod.OAuth:
      return { name: "OAuth", icon: IdCardIcon };
    case AwsConnectionMethod.AccessKey:
    case OCIConnectionMethod.AccessKey:
    case S3CompatibleConnectionMethod.AccessKey:
      return { name: "액세스 키", icon: KeyRoundIcon };
    case AwsConnectionMethod.AssumeRole:
      return { name: "역할 수임", icon: UserIcon };
    case GcpConnectionMethod.ServiceAccountImpersonation:
      return { name: "서비스 계정 가장", icon: UserIcon };
    case DatabricksConnectionMethod.ServicePrincipal:
      return { name: "서비스 주체", icon: UserIcon };
    case CamundaConnectionMethod.ClientCredentials:
      return { name: "클라이언트 인증 정보", icon: KeyRoundIcon };
    case HumanitecConnectionMethod.ApiToken:
    case TerraformCloudConnectionMethod.ApiToken:
    case VercelConnectionMethod.ApiToken:
    case OnePassConnectionMethod.ApiToken:
    case CloudflareConnectionMethod.ApiToken:
    case BitbucketConnectionMethod.ApiToken:
    case ZabbixConnectionMethod.ApiToken:
    case DigitalOceanConnectionMethod.ApiToken:
    case NorthflankConnectionMethod.ApiToken:
    case OktaConnectionMethod.ApiToken:
    case LaravelForgeConnectionMethod.ApiToken:
    case DbtConnectionMethod.ApiToken:
    case CircleCIConnectionMethod.ApiToken:
    case TravisCIConnectionMethod.ApiToken:
    case DopplerConnectionMethod.ApiToken:
    case RundeckConnectionMethod.ApiToken:
    case PortainerConnectionMethod.ApiToken:
      return { name: "API 토큰", icon: KeyRoundIcon };
    case VenafiConnectionMethod.ApiKey:
      return { name: "API 키", icon: KeyRoundIcon };
    case PostgresConnectionMethod.UsernameAndPassword:
    case MsSqlConnectionMethod.UsernameAndPassword:
    case MySqlConnectionMethod.UsernameAndPassword:
    case OracleDBConnectionMethod.UsernameAndPassword:
    case AzureADCSConnectionMethod.UsernamePassword:
    case AdcsConnectionMethod.UsernamePassword:
    case RedisConnectionMethod.UsernameAndPassword:
    case MongoDBConnectionMethod.UsernameAndPassword:
    case UltraDNSConnectionMethod.UsernamePassword:
      return { name: "사용자 이름 및 비밀번호", icon: LockIcon };
    case SnowflakeConnectionMethod.UsernameAndToken:
      return { name: "사용자 이름 및 토큰", icon: KeyRoundIcon };
    case HCVaultConnectionMethod.AccessToken:
    case TeamCityConnectionMethod.AccessToken:
    case AzureDevOpsConnectionMethod.AccessToken:
    case WindmillConnectionMethod.AccessToken:
    case FlyioConnectionMethod.AccessToken:
    case NetlifyConnectionMethod.AccessToken:
    case ConvexConnectionMethod.PersonalAccessToken:
    case HasuraCloudConnectionMethod.AccessToken:
    case QoveryConnectionMethod.AccessToken:
    case Cloud66ConnectionMethod.AccessToken:
      return { name: "개인 액세스 토큰", icon: KeyRoundIcon };
    case Auth0ConnectionMethod.ClientCredentials:
    case SalesforceConnectionMethod.ClientCredentials:
      return { name: "클라이언트 인증 정보", icon: ServerIcon };
    case HCVaultConnectionMethod.AppRole:
      return { name: "앱 역할", icon: UserIcon };
    case LdapConnectionMethod.SimpleBind:
      return { name: "단순 바인딩", icon: LinkIcon };
    case HerokuConnectionMethod.AuthToken:
      return { name: "인증 토큰", icon: KeyRoundIcon };
    case RailwayConnectionMethod.AccountToken:
    case SupabaseConnectionMethod.AccessToken:
      return { name: "계정 토큰", icon: KeyRoundIcon };
    case RailwayConnectionMethod.TeamToken:
      return { name: "팀 토큰", icon: KeyRoundIcon };
    case RailwayConnectionMethod.ProjectToken:
      return { name: "프로젝트 토큰", icon: KeyRoundIcon };
    case RenderConnectionMethod.ApiKey:
    case ChecklyConnectionMethod.ApiKey:
    case OpenRouterConnectionMethod.ApiKey:
    case OpenAIConnectionMethod.ApiKey:
    case AnthropicConnectionMethod.ApiKey:
    case LiteLLMConnectionMethod.ApiKey:
    case FireworksConnectionMethod.ApiKey:
    case DevinConnectionMethod.ApiKey:
    case DigiCertConnectionMethod.ApiKey:
    case GoDaddyConnectionMethod.ApiKey:
    case TriggerDevConnectionMethod.ApiKey:
    case DatadogConnectionMethod.ApiKey:
    case DaytonaConnectionMethod.ApiKey:
    case PowerDnsConnectionMethod.ApiKey:
    case KeeperConnectionMethod.ApiKey:
      return { name: "API 키", icon: KeyRoundIcon };
    case ChefConnectionMethod.UserKey:
      return { name: "사용자 키", icon: KeyRoundIcon };
    case AzureClientSecretsConnectionMethod.ClientSecret:
    case AzureAppConfigurationConnectionMethod.ClientSecret:
    case AzureKeyVaultConnectionMethod.ClientSecret:
    case AzureDevOpsConnectionMethod.ClientSecret:
      return { name: "클라이언트 시크릿", icon: KeyRoundIcon };
    case AzureClientSecretsConnectionMethod.Certificate:
    case AzureKeyVaultConnectionMethod.Certificate:
      return { name: "인증서", icon: FileBadgeIcon };
    case DNSMadeEasyConnectionMethod.APIKeySecret:
    case SpaceliftConnectionMethod.ApiKeySecret:
      return { name: "API 키 및 시크릿", icon: KeyRoundIcon };
    case AzureDNSConnectionMethod.ClientSecret:
    case AzureEntraIdConnectionMethod.ClientSecret:
    case MicrosoftIntuneConnectionMethod.ClientSecret:
      return { name: "클라이언트 시크릿", icon: KeyRoundIcon };
    case OctopusDeployConnectionMethod.ApiKey:
      return { name: "API 키", icon: KeyRoundIcon };
    case DatadogConnectionMethod.Token:
      return { name: "서비스 액세스 토큰", icon: KeyRoundIcon };
    case SshConnectionMethod.Password:
      return { name: "비밀번호", icon: LockIcon };
    case SshConnectionMethod.SshKey:
      return { name: "SSH 키", icon: KeyRoundIcon };
    case SmbConnectionMethod.Credentials:
      return { name: "인증 정보", icon: LockIcon };
    case WinRMConnectionMethod.UsernamePassword:
      return { name: "사용자 이름 및 비밀번호", icon: LockIcon };
    case ExternalInfisicalConnectionMethod.MachineIdentityUniversalAuth:
      return { name: "머신 ID - Universal Auth", icon: KeyRoundIcon };
    case NetScalerConnectionMethod.BasicAuth:
    case PaloAltoNetworksConnectionMethod.BasicAuth:
    case KempLoadMasterConnectionMethod.BasicAuth:
    case NutanixPrismCentralConnectionMethod.BasicAuth:
    case F5BigIpConnectionMethod.BasicAuth:
    case HpeIloConnectionMethod.BasicAuth:
      return { name: "기본 인증", icon: LockIcon };
    case NutanixPrismCentralConnectionMethod.ApiKey:
      return { name: "API 키", icon: KeyRoundIcon };
    case OVHConnectionMethod.Certificate:
      return { name: "인증서", icon: FileBadgeIcon };
    default:
      throw new Error(`지원되지 않는 앱 연결 방식: ${method}`);
  }
};

export const AWS_REGIONS = [
  { name: "미국 동부(오하이오)", slug: "us-east-2" },
  { name: "미국 동부(버지니아 북부)", slug: "us-east-1" },
  { name: "미국 서부(캘리포니아 북부)", slug: "us-west-1" },
  { name: "미국 서부(오리건)", slug: "us-west-2" },
  { name: "아프리카(케이프타운)", slug: "af-south-1" },
  { name: "아시아 태평양(홍콩)", slug: "ap-east-1" },
  { name: "아시아 태평양(하이데라바드)", slug: "ap-south-2" },
  { name: "아시아 태평양(자카르타)", slug: "ap-southeast-3" },
  { name: "아시아 태평양(멜버른)", slug: "ap-southeast-4" },
  { name: "아시아 태평양(뭄바이)", slug: "ap-south-1" },
  { name: "아시아 태평양(오사카)", slug: "ap-northeast-3" },
  { name: "아시아 태평양(서울)", slug: "ap-northeast-2" },
  { name: "아시아 태평양(싱가포르)", slug: "ap-southeast-1" },
  { name: "아시아 태평양(시드니)", slug: "ap-southeast-2" },
  { name: "아시아 태평양(도쿄)", slug: "ap-northeast-1" },
  { name: "캐나다(중부)", slug: "ca-central-1" },
  { name: "유럽(프랑크푸르트)", slug: "eu-central-1" },
  { name: "유럽(아일랜드)", slug: "eu-west-1" },
  { name: "유럽(런던)", slug: "eu-west-2" },
  { name: "유럽(밀라노)", slug: "eu-south-1" },
  { name: "유럽(파리)", slug: "eu-west-3" },
  { name: "유럽(스페인)", slug: "eu-south-2" },
  { name: "유럽(스톡홀름)", slug: "eu-north-1" },
  { name: "유럽(취리히)", slug: "eu-central-2" },
  { name: "중동(바레인)", slug: "me-south-1" },
  { name: "중동(아랍에미리트)", slug: "me-central-1" },
  { name: "남아메리카(상파울루)", slug: "sa-east-1" },
  { name: "AWS GovCloud(미국 동부)", slug: "us-gov-east-1" },
  { name: "AWS GovCloud(미국 서부)", slug: "us-gov-west-1" }
];

export const CSRF_TOKEN_STORAGE_KEY = "latestCSRFToken";
export const GITHUB_CONNECTION_FORM_STORAGE_KEY = "githubConnectionFormData";

export const buildGitHubHostUrl = (host?: string | null) =>
  host && host.trim().length > 0 ? `https://${host.trim()}` : "https://github.com";

export const buildGitHubAppUrl = (
  slug: string,
  host?: string | null,
  instanceType?: "cloud" | "server"
) => `${buildGitHubHostUrl(host)}/${instanceType === "server" ? "github-apps" : "apps"}/${slug}`;

export const buildGitHubAppInstallUrl = (
  slug: string,
  state: string,
  host?: string | null,
  instanceType?: "cloud" | "server"
) => `${buildGitHubAppUrl(slug, host, instanceType)}/installations/new?state=${state}`;

export const generateCsrfToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export const consumeCsrfToken = (state: string) => {
  if (state !== localStorage.getItem(CSRF_TOKEN_STORAGE_KEY)) return false;
  localStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
  return true;
};

export const useGetAppConnectionOauthReturnUrl = () => {
  const {
    location: { pathname }
  } = useRouterState();

  return pathname;
};

export const getIntegrationsListTab = () => {
  if (localStorage.getItem("pkiSyncFormData")) return IntegrationsListPageTabs.PkiSyncs;
  if (localStorage.getItem("secretSyncFormData")) return IntegrationsListPageTabs.SecretSyncs;
  return IntegrationsListPageTabs.AppConnections;
};

export const getConnectionFlowReturnNavigateOptions = ({
  returnUrl,
  projectId,
  reopenFormApp
}: {
  returnUrl: string;
  projectId?: string;
  reopenFormApp?: AppConnection;
}) => {
  const search = {
    ...(reopenFormApp ? { addConnectionApp: reopenFormApp } : {}),
    ...(returnUrl.includes("integrations")
      ? {
          selectedTab: reopenFormApp
            ? IntegrationsListPageTabs.AppConnections
            : getIntegrationsListTab()
        }
      : {})
  };

  return {
    to: returnUrl,
    params: { projectId },
    search: Object.keys(search).length > 0 ? search : undefined
  };
};

export type TStoredConnectionFormData<T> =
  | { status: "ok"; data: T }
  | { status: "missing" }
  | { status: "corrupt" };

export const readConnectionFormData = <T>(storageKey: string): TStoredConnectionFormData<T> => {
  const raw = localStorage.getItem(storageKey);

  if (raw === null) return { status: "missing" };

  try {
    return { status: "ok", data: JSON.parse(raw) as T };
  } catch {
    localStorage.removeItem(storageKey);
    return { status: "corrupt" };
  }
};
