import { Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { RagService } from './rag.service';
import { PerguntaDto } from './dto/PerguntaDto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

   @Post('add')
  adicionar(@Body('texto') texto: string, @Body('categoria') categoria: string) {
    return this.ragService.adicionar(texto,categoria);
  }

@Post('perguntar')
perguntar(@Body() body: PerguntaDto) {
  return this.ragService.perguntar(body.pergunta, body.categoria);
}

  @Get('listar')
  listar() {
    return this.ragService.listar();
  }

  @Delete(':id')
  deletar(@Param('id') id: string) {
    return this.ragService.deletar(id);
  }

 @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('texto') texto?: string,
    @Body('categoria') categoria?: string,
  ) {
    return this.ragService.processarUpload(file, texto, categoria);
  }
}
