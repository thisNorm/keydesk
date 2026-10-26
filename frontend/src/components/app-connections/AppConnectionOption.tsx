import { ReactNode } from "react";
import { components, OptionProps } from "react-select";
import { CheckIcon, PlusIcon } from "lucide-react";

import {
  Badge,
  OrgIcon,
  SubOrgIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";

type TAppConnectionOptionContentProps = {
  data: Pick<TAvailableAppConnection, "id" | "name"> & { projectId?: string | null };
  createLabel?: ReactNode;
  isOnlyOption?: boolean;
  isSelected?: boolean;
  label?: ReactNode;
};

export const AppConnectionOptionContent = ({
  data,
  createLabel,
  isOnlyOption = false,
  isSelected = false,
  label
}: TAppConnectionOptionContentProps) => {
  const isCreateOption = data.id === "_create" || data.id.startsWith("_create:");
  const { isSubOrganization } = useOrganization();

  return (
    <div className="flex flex-row items-center justify-between">
      {isCreateOption ? (
        <div
          className={`flex items-center gap-x-1 ${isOnlyOption ? "text-foreground" : "text-accent"}`}
        >
          <PlusIcon className="size-4" />
          <span className="mr-auto">{createLabel ?? "새 연결 만들기"}</span>
        </div>
      ) : (
        <>
          <p className="mr-auto truncate">{data.name}</p>
          {label}
          {!data.projectId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  {isSubOrganization ? (
                    <Badge variant="sub-org">
                      <SubOrgIcon />
                      하위 조직
                    </Badge>
                  ) : (
                    <Badge variant="org">
                      <OrgIcon />
                      조직
                    </Badge>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                이 연결의 소속: {isSubOrganization ? "sub-" : ""}조직입니다.
              </TooltipContent>
            </Tooltip>
          )}
          {isSelected && <CheckIcon className="ml-2 size-4" />}
        </>
      )}
    </div>
  );
};

export const AppConnectionOption = ({
  isSelected,
  ...props
}: OptionProps<TAvailableAppConnection>) => {
  const isCreateOption = props.data.id === "_create" || props.data.id.startsWith("_create:");
  const isPerAppCreateOption = isCreateOption && props.data.id !== "_create";
  const isOnlyOption = isCreateOption && props.selectProps.options.length === 1;

  return (
    <components.Option isSelected={isSelected} {...props}>
      <AppConnectionOptionContent
        data={props.data}
        createLabel={isPerAppCreateOption ? props.children : undefined}
        isOnlyOption={isOnlyOption}
        isSelected={isSelected}
      />
    </components.Option>
  );
};
