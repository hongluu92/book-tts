import { IsNotEmpty } from 'class-validator';

export class ImportBookDto {
  @IsNotEmpty()
  file: Express.Multer.File;
}
