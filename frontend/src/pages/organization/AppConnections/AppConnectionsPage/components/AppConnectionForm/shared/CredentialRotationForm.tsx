import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { format, setHours, setMinutes } from "date-fns";
import { Info } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getRotateAtLocal } from "@app/helpers/secretRotationsV2";
import { useScopeVariant } from "@app/hooks";

type Props = {
  children?: ReactNode;
};

export const CredentialRotationForm = ({ children }: Props) => {
  const { control, watch } = useFormContext();
  const scopeVariant = useScopeVariant();

  const isAutoRotationEnabled = watch("isAutoRotationEnabled");
  return (
    <div>
      <div className={twMerge(isAutoRotationEnabled && "mb-4", "mt-5")}>
        <Controller
          name="isAutoRotationEnabled"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="auto-rotation-enabled">인증 정보 자동 교체</Label>
                  <FieldDescription>
                    {value
                      ? "위에서 지정한 교체 주기가 지나면 앱 연결의 인증 정보를 자동으로 교체합니다."
                      : "앱 연결의 인증 정보를 자동으로 교체하지 않습니다."}
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  aria-invalid={Boolean(error)}
                  id="auto-rotation-enabled"
                  variant={scopeVariant}
                  checked={value}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </div>

      {isAutoRotationEnabled && (
        <>
          {children}
          <div className="flex w-full items-start gap-2">
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>
                    교체 주기(일)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Keydesk가 이 연결의 인증 정보를 교체하는 주기입니다.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    value={value}
                    type="number"
                    onChange={(e) => onChange(parseInt(e.target.value, 10))}
                    min={1}
                    placeholder="30"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
              control={control}
              name="rotation.rotationInterval"
            />
            <Controller
              render={({ field: { value, onChange }, fieldState: { error } }) => {
                return (
                  <Field className="flex-1">
                    <FieldLabel>
                      교체 시각(현지 시간)
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          Keydesk가 이 연결의 인증 정보를 교체할 시각입니다.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Input
                      type="time"
                      value={format(getRotateAtLocal(value), "HH:mm")}
                      onChange={(e) => {
                        const time = e.target.value;
                        if (time) {
                          const [hours, minutes] = time.split(":").map((str) => parseInt(str, 10));
                          const newSelectedDate = setHours(setMinutes(new Date(), minutes), hours);
                          onChange({
                            hours: newSelectedDate.getUTCHours(),
                            minutes: newSelectedDate.getUTCMinutes()
                          });
                        }
                      }}
                      className="scheme-dark"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                );
              }}
              control={control}
              name="rotation.rotateAtUtc"
            />
          </div>
        </>
      )}
    </div>
  );
};
