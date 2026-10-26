import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { CircleHelpIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useScopeVariant } from "@app/hooks";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { useHasCustomMigrationAvailable } from "@app/hooks/api/migration";
import { useImportVault } from "@app/hooks/api/migration/mutations";
import { ExternalMigrationProviders } from "@app/hooks/api/migration/types";

type Props = {
  id?: string;
  onClose: () => void;
};

enum VaultMappingType {
  KeyVault = "key-vault",
  Namespace = "namespace",
  Custom = "custom"
}

const GATEWAY_NONE = "__gateway_none__";

type VaultGatewaySelectProps = {
  isAllowed: boolean;
  isGatewayLoading: boolean;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  hasError: boolean;
  gateways?: { id: string; name: string }[];
};

function VaultGatewaySelect({
  isAllowed,
  isGatewayLoading,
  value,
  onChange,
  hasError,
  gateways
}: VaultGatewaySelectProps) {
  const select = (
    <Select
      value={value || GATEWAY_NONE}
      onValueChange={(v) => {
        onChange(v === GATEWAY_NONE ? undefined : v);
      }}
      disabled={!isAllowed || isGatewayLoading}
    >
      <SelectTrigger size="default" className="w-full max-w-none min-w-0" aria-invalid={hasError}>
        <SelectValue
          placeholder={isGatewayLoading ? "게이트웨이 불러오는 중…" : "인터넷 게이트웨이"}
        />
      </SelectTrigger>
      <SelectContent position="popper" className="min-w-(--radix-select-trigger-width)">
        <SelectItem value={GATEWAY_NONE}>인터넷 게이트웨이</SelectItem>
        {gateways?.map((el) => (
          <SelectItem value={el.id} key={el.id}>
            {el.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (isAllowed) {
    return select;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full cursor-not-allowed">{select}</span>
      </TooltipTrigger>
      <TooltipContent>
        접근이 제한되었습니다. 리소스에 게이트웨이를 연결할 권한이 없습니다.
      </TooltipContent>
    </Tooltip>
  );
}

const MAPPING_TYPE_MENU_ITEMS = [
  {
    isCustom: false,
    value: VaultMappingType.KeyVault,
    label: "키 보관소",
    tooltip: (
      <div>
        키 보관소로 매핑하면 Vault의 각 키 보관소를 Keydesk 프로젝트로 만듭니다. 키 보관소 내의 각
        시크릿 경로는 해당 프로젝트의 환경으로 만듭니다. 프로젝트 매핑 유형으로 키 보관소를 선택하면
        각 프로젝트에 Production이라는 기본 환경을 만들고 키 보관소의 시크릿을 저장합니다.
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <div>키 보관소 → 프로젝트</div>
          <div>기본 환경(Production)</div>
          <div>시크릿 경로 → 시크릿 폴더</div>
          <div>시크릿 데이터 → 시크릿</div>
        </div>
      </div>
    )
  },
  {
    isCustom: false,
    value: VaultMappingType.Namespace,
    label: "네임스페이스",
    tooltip: (
      <div>
        네임스페이스로 매핑하면 Vault의 각 네임스페이스를 Keydesk 프로젝트로 만듭니다. 네임스페이스
        내의 각 키 보관소(KV)는 해당 프로젝트의 환경으로 만듭니다.
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <div>네임스페이스 → 프로젝트</div>
          <div>키 보관소 → 프로젝트 환경</div>
          <div>시크릿 경로 → 시크릿 폴더</div>
          <div>시크릿 데이터 → 시크릿</div>
        </div>
      </div>
    )
  },
  {
    isCustom: true,
    value: VaultMappingType.Custom,
    label: "사용자 지정 마이그레이션",
    tooltip: (
      <div>
        필요에 맞게 Vault 마이그레이션을 구성할 수 있습니다. 사용자 지정 마이그레이션을 시작하려면
        영업팀에 문의하세요.
      </div>
    )
  }
];

export const VaultPlatformModal = ({ onClose }: Props) => {
  const scopeVariant = useScopeVariant();
  const { data: isCustomMigrationAvailable } = useHasCustomMigrationAvailable(
    ExternalMigrationProviders.Vault
  );

  const formSchema = z.object({
    vaultUrl: z.string().min(1),
    gatewayId: z.string().optional(),
    vaultNamespace: z.string().trim().optional(),
    vaultAccessToken: z.string().min(1),
    mappingType: z.nativeEnum(VaultMappingType).default(VaultMappingType.KeyVault)
  });
  type TFormData = z.infer<typeof formSchema>;

  const { data: gateways, isPending: isGatewayLoading } = useQuery(gatewaysQueryKeys.list());
  const { mutateAsync: importVault } = useImportVault();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isLoading, isDirty, isSubmitting, isValid }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema)
  });

  const onSubmit = async (data: TFormData) => {
    await importVault({
      vaultAccessToken: data.vaultAccessToken,
      vaultNamespace: data.vaultNamespace,
      vaultUrl: data.vaultUrl,
      mappingType: data.mappingType,
      ...(data.gatewayId && { gatewayId: data.gatewayId })
    });
    createNotification({
      title: "가져오기 시작",
      text: "데이터를 가져오는 중입니다. 완료되거나 실패하면 이메일로 알려드립니다. 최대 10분이 걸릴 수 있습니다.",
      type: "info"
    });

    onClose();
    reset();
  };

  return (
    <div>
      <Alert variant="info" className="mb-4">
        <AlertTitle>Vault KV 시크릿 엔진 가져오기</AlertTitle>
        <AlertDescription>
          <p>현재 Vault Dedicated 및 자체 호스팅 Vault의 정적 시크릿을 가져올 수 있습니다.</p>
          <p className="mt-2 text-xs opacity-80">
            현재 Vault 마이그레이션은 KV 시크릿 엔진만 지원합니다.
          </p>
        </AlertDescription>
      </Alert>
      <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
        <div className="w-full flex-1">
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Controller
                control={control}
                name="gatewayId"
                defaultValue=""
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel className="inline-flex flex-wrap items-baseline gap-1.5">
                      게이트웨이
                      <span className="text-xs font-normal text-muted">(선택 사항)</span>
                    </FieldLabel>
                    <FieldContent>
                      <VaultGatewaySelect
                        isAllowed={isAllowed}
                        isGatewayLoading={isGatewayLoading}
                        value={value}
                        onChange={onChange}
                        hasError={Boolean(error)}
                        gateways={gateways}
                      />
                    </FieldContent>
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}
          </OrgPermissionCan>
        </div>

        <Controller
          control={control}
          name="vaultUrl"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Vault URL</FieldLabel>
              <FieldContent>
                <Input placeholder="" {...field} isError={Boolean(error)} />
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="vaultNamespace"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Vault 네임스페이스</FieldLabel>
              <FieldContent>
                <Input
                  type="text"
                  placeholder="admin"
                  autoComplete="off"
                  {...field}
                  isError={Boolean(error)}
                />
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="vaultAccessToken"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Vault 액세스 토큰</FieldLabel>
              <FieldContent>
                <Input
                  type="password"
                  placeholder="hvs.XXXXXXXXXXXXXXXX"
                  autoComplete="new-password"
                  {...field}
                  isError={Boolean(error)}
                />
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="mappingType"
          defaultValue={VaultMappingType.KeyVault}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>프로젝트 매핑</FieldLabel>
              <FieldContent>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  {MAPPING_TYPE_MENU_ITEMS.map((el) => (
                    <div
                      key={el.value}
                      className={twMerge(
                        "flex w-full cursor-pointer flex-col items-center gap-2 rounded-sm border border-border bg-container/50 p-4 opacity-75 transition-all",
                        field.value === el.value
                          ? "border-org/50 bg-container opacity-100"
                          : "hover:border-accent/30 hover:bg-foreground/5",
                        el.isCustom && "col-span-2",
                        el.isCustom &&
                          !isCustomMigrationAvailable?.data?.enabled &&
                          "pointer-events-none cursor-not-allowed border-border bg-muted/30 opacity-40"
                      )}
                      onClick={() => {
                        if (el.isCustom && !isCustomMigrationAvailable?.data?.enabled) return;

                        field.onChange(el.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        if (el.isCustom && !isCustomMigrationAvailable?.data?.enabled) return;

                        field.onChange(el.value);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex items-center gap-1">
                        <div className="text-center text-sm text-foreground">{el.label}</div>
                        {el.tooltip && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex text-muted hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CircleHelpIcon className="size-4" aria-label="자세히 보기" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-96">{el.tooltip}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </FieldContent>
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />

        <div className="flex items-center gap-2 pt-2">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isLoading || isSubmitting}
            isDisabled={!isDirty || isSubmitting || isLoading || !isValid}
          >
            데이터 가져오기
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
        </div>
      </form>
    </div>
  );
};
