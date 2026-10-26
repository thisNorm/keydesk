import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v3";

import { IntegrationsPageForm } from "./components";

export const IntegrationsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full text-foreground">
      <Helmet>
        <title>{t("common.head-title", { title: "관리자" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <PageHeader
            scope="instance"
            title="연동"
            description="Keydesk 인스턴스의 연동을 관리하세요."
          />
          <IntegrationsPageForm />
        </div>
      </div>
    </div>
  );
};
