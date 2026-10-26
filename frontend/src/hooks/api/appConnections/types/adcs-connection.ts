import { z } from "zod";

import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum AdcsConnectionMethod {
  UsernamePassword = "username-password"
}

export const CreateAdcsConnectionSchema = z.object({
  host: z.string().min(1, "CA 호스트를 입력하세요"),
  username: z.string().min(1, "사용자 이름을 입력하세요"),
  password: z.string().min(1, "비밀번호를 입력하세요")
});

export type TCreateAdcsConnection = z.infer<typeof CreateAdcsConnectionSchema>;

export type TAdcsConnection = TRootAppConnection & { app: AppConnection.ADCS } & {
  method: AdcsConnectionMethod.UsernamePassword;
  credentials: TCreateAdcsConnection;
};
