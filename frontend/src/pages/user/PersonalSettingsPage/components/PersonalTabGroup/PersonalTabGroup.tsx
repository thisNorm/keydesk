import { ExternalLinkIcon, KeyRoundIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";

import { PersonalAuthTab } from "../PersonalAuthTab";
import { PersonalGeneralTab } from "../PersonalGeneralTab";

type PersonalSettingsTab = "general" | "authentication" | "api-keys";

type Props = {
  selectedTab: PersonalSettingsTab;
  onTabChange: (tab: PersonalSettingsTab) => void;
};

const tabs = [
  { name: "일반", key: "general" },
  { name: "인증", key: "authentication" },
  { name: "Keydesk API 키", key: "api-keys", icon: TriangleAlertIcon }
] satisfies { name: string; key: PersonalSettingsTab; icon?: typeof TriangleAlertIcon }[];

export const PersonalTabGroup = ({ selectedTab, onTabChange }: Props) => {
  return (
    <Tabs
      value={selectedTab}
      onValueChange={(value) => onTabChange(value as PersonalSettingsTab)}
      className="mt-8"
    >
      <TabsList variant="filled" aria-label="개인 설정 항목">
        {tabs.map(({ name, key, icon: Icon }) => (
          <TabsTrigger value={key} key={key}>
            {Icon && <Icon aria-hidden className="text-danger" />}
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="general">
        <PersonalGeneralTab />
      </TabsContent>
      <TabsContent value="authentication">
        <PersonalAuthTab />
      </TabsContent>
      <TabsContent value="api-keys">
        <Alert variant="danger">
          <KeyRoundIcon />
          <AlertTitle>Keydesk API 키 인증은 더 이상 지원하지 않습니다.</AlertTitle>
          <AlertDescription>
            <p>
              기존 키로는 요청을 인증할 수 없습니다. 프로그램에서 접근하려면 머신 ID를 사용하세요.
              다음 문서를 확인하세요:{" "}
              <a
                href="https://infisical.com/docs/documentation/platform/identities/overview"
                target="_blank"
                rel="noreferrer"
              >
                머신 ID 문서 <ExternalLinkIcon className="inline size-3" />
              </a>
              .
            </p>
          </AlertDescription>
        </Alert>
      </TabsContent>
    </Tabs>
  );
};
