import { Global, Module } from "@nestjs/common";
import { DbService } from "./db.service";

/** Global so any module can inject DbService without importing this module. */
@Global()
@Module({
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
