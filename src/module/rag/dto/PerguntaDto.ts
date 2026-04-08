import { IsString, MinLength } from 'class-validator';

export class PerguntaDto {
  @IsString()
  @MinLength(3)
  pergunta: string;

   @IsString()
  @MinLength(3)
  categoria: string;
}