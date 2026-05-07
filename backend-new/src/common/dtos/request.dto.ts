import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsString()
  university_code?: string;
}

export class SearchRequestDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  university_code?: string;

  @IsOptional()
  @IsNumber()
  top_k?: number;

  @IsOptional()
  @IsString()
  method_id?: string;

  @IsOptional()
  @IsString()
  program_code?: string;

  @IsOptional()
  @IsString()
  program_type?: string;
}

export class IngestRequestDto {
  @IsOptional()
  @IsString()
  data_dir?: string;

  @IsOptional()
  @IsBoolean()
  rebuild_index?: boolean;

  @IsOptional()
  university_codes?: string[];
}
