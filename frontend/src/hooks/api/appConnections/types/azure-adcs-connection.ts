import { z } from "zod";

import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum AzureADCSConnectionMethod {
  UsernamePassword = "username-password"
}

export const CreateAzureADCSConnectionSchema = z.object({
  adcsUrl: z.string().url().min(1, "ADCS URL을 입력하세요"),
  username: z.string().min(1, "사용자 이름을 입력하세요"),
  password: z.string().min(1, "비밀번호를 입력하세요")
});

export type TCreateAzureADCSConnection = z.infer<typeof CreateAzureADCSConnectionSchema>;

export type TAzureADCSConnection = TRootAppConnection & { app: AppConnection.AzureADCS } & {
  method: AzureADCSConnectionMethod.UsernamePassword;
  credentials: TCreateAzureADCSConnection;
};
