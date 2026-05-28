import type { LocalSeparatorModelConfig } from './types';
import { LocalSeparatorCpuDsp } from './cpuDsp';
import { reflectPad } from './shared';

function log(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(`[localSeparator] ${message}`);
    return;
  }
  console.log(`[localSeparator] ${message}`, payload);
}

interface GPUBufferLike {
  destroy(): void;
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
}

interface GPUComputePassEncoderLike {
  setPipeline(pipeline: GPUComputePipelineLike): void;
  setBindGroup(index: number, bindGroup: unknown): void;
  dispatchWorkgroups(x: number): void;
  end(): void;
}

interface GPUCommandEncoderLike {
  copyBufferToBuffer(source: GPUBufferLike, sourceOffset: number, destination: GPUBufferLike, destinationOffset: number, size: number): void;
  beginComputePass(): GPUComputePassEncoderLike;
  finish(): unknown;
}

interface GPUComputePipelineLike {
  getBindGroupLayout(index: number): unknown;
}

interface GPUDeviceLike {
  queue: {
    submit(commands: unknown[]): void;
    writeBuffer(buffer: GPUBufferLike, bufferOffset: number, data: BufferSource): void;
  };
  createBuffer(descriptor: { size: number; usage: number }): GPUBufferLike;
  createCommandEncoder(): GPUCommandEncoderLike;
  createBindGroup(descriptor: { layout: unknown; entries: Array<{ binding: number; resource: { buffer: GPUBufferLike } }> }): unknown;
  createComputePipeline(descriptor: {
    layout: 'auto';
    compute: {
      module: unknown;
      entryPoint: string;
    };
  }): GPUComputePipelineLike;
  createShaderModule(descriptor: { code: string }): unknown;
}

interface GPUAdapterLike {
  features?: {
    values?(): IterableIterator<unknown>;
  };
  limits?: unknown;
  info?: unknown;
  requestDevice(): Promise<GPUDeviceLike>;
}

interface NavigatorWithGpu {
  gpu?: {
    requestAdapter(options: { powerPreference: string }): Promise<GPUAdapterLike | null>;
  };
}

declare const GPUBufferUsage: {
  COPY_DST: number;
  MAP_READ: number;
  STORAGE: number;
  COPY_SRC: number;
  UNIFORM: number;
};
declare const GPUMapMode: {
  READ: number;
};

const FRAMING_SHADER = `
struct Params {
  nfft: u32,
  hop: u32,
  frames: u32,
  paddedLength: u32,
}

@group(0) @binding(0) var<storage, read> leftInput: array<f32>;
@group(0) @binding(1) var<storage, read> rightInput: array<f32>;
@group(0) @binding(2) var<storage, read> window: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  let total = params.frames * params.nfft * 2u;
  if (index >= total) {
    return;
  }

  let sample = index % params.nfft;
  let frame = (index / params.nfft) % params.frames;
  let channel = index / (params.nfft * params.frames);
  let sourceIndex = frame * params.hop + sample;
  let sampleValue = select(leftInput[sourceIndex], rightInput[sourceIndex], channel == 1u);
  output[index] = sampleValue * window[sample];
}
`;

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

async function readBuffer(device: GPUDeviceLike, sourceBuffer: GPUBufferLike, size: number): Promise<Float32Array> {
  const readBuffer = device.createBuffer({
    size: alignTo(size, 4),
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(sourceBuffer, 0, readBuffer, 0, size);
  device.queue.submit([encoder.finish()]);

  await readBuffer.mapAsync(GPUMapMode.READ);
  const copy = new Float32Array(readBuffer.getMappedRange().slice(0));
  readBuffer.unmap();
  readBuffer.destroy();
  return copy;
}

export class LocalSeparatorGpuDsp {
  private readonly device: GPUDeviceLike;
  private readonly cpuDsp: LocalSeparatorCpuDsp;
  private readonly nFft: number;
  private readonly hopLength: number;
  private readonly trim: number;
  private windowBuffer: GPUBufferLike | null = null;
  private paramBuffer: GPUBufferLike | null = null;
  private readonly pipeline: GPUComputePipelineLike;

  public static async create(config: LocalSeparatorModelConfig): Promise<LocalSeparatorGpuDsp> {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU is not available for GPU DSP.');
    }

    log('Requesting WebGPU adapter for GPU DSP.');
    const adapter = await (navigator as NavigatorWithGpu).gpu?.requestAdapter({
      powerPreference: 'high-performance',
    });
    if (!adapter) {
      throw new Error('No WebGPU adapter was available for GPU DSP.');
    }
    log('WebGPU adapter acquired for GPU DSP.', {
      features: typeof adapter.features?.values === 'function' ? Array.from(adapter.features.values()) : undefined,
      limits: adapter.limits,
      info: typeof adapter.info === 'object' ? adapter.info : undefined,
    });

    log('Requesting WebGPU device for GPU DSP.');
    const device = await adapter.requestDevice();
    log('WebGPU device acquired for GPU DSP.');
    return new LocalSeparatorGpuDsp(config, device);
  }

  private constructor(config: LocalSeparatorModelConfig, device: GPUDeviceLike) {
    this.device = device;
    this.cpuDsp = new LocalSeparatorCpuDsp(config);
    this.nFft = config.metadata.mdx_n_fft_scale_set;
    this.hopLength = config.defaults.hopLength;
    this.trim = Math.floor(this.nFft / 2);
    log('Creating GPU DSP compute pipeline.');
    this.pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: FRAMING_SHADER }),
        entryPoint: 'main',
      },
    });
    log('GPU DSP compute pipeline created.');
  }

  public async forwardStereo(leftChunk: Float32Array, rightChunk: Float32Array): Promise<{
    data: Float32Array;
    dims: number[];
    frames: number;
  }> {
    this.ensureStaticBuffers();

    const paddedLeft = reflectPad(leftChunk, this.trim, this.trim);
    const paddedRight = reflectPad(rightChunk, this.trim, this.trim);
    const frames = Math.floor((paddedLeft.length - this.nFft) / this.hopLength) + 1;

    const leftBuffer = this.device.createBuffer({
      size: paddedLeft.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const rightBuffer = this.device.createBuffer({
      size: paddedRight.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const framedSize = frames * this.nFft * 2 * 4;
    const outputBuffer = this.device.createBuffer({
      size: framedSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.device.queue.writeBuffer(leftBuffer, 0, paddedLeft);
    this.device.queue.writeBuffer(rightBuffer, 0, paddedRight);
    this.device.queue.writeBuffer(this.paramBuffer!, 0, new Uint32Array([this.nFft, this.hopLength, frames, paddedLeft.length]));

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: leftBuffer } },
        { binding: 1, resource: { buffer: rightBuffer } },
        { binding: 2, resource: { buffer: this.windowBuffer! } },
        { binding: 3, resource: { buffer: outputBuffer } },
        { binding: 4, resource: { buffer: this.paramBuffer! } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil((frames * this.nFft * 2) / 256));
    pass.end();
    this.device.queue.submit([encoder.finish()]);

    const framed = await readBuffer(this.device, outputBuffer, framedSize);

    leftBuffer.destroy();
    rightBuffer.destroy();
    outputBuffer.destroy();

    return this.packFramedAudio(framed, frames);
  }

  public async inverseStereo(payload: { data: Float32Array; dims: number[]; frames?: number }) {
    return this.cpuDsp.inverseStereo(payload);
  }

  public dispose(): void {
    this.cpuDsp.dispose();
    this.windowBuffer?.destroy();
    this.paramBuffer?.destroy();
  }

  private ensureStaticBuffers(): void {
    if (!this.windowBuffer) {
      const window = this.cpuDsp.window;
      this.windowBuffer = this.device.createBuffer({
        size: window.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(this.windowBuffer, 0, window);
    }

    if (!this.paramBuffer) {
      this.paramBuffer = this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
  }

  private packFramedAudio(framed: Float32Array, frames: number): { data: Float32Array; dims: number[]; frames: number } {
    const tensor = new Float32Array(4 * this.cpuDsp.dimF * frames);
    const dims = [1, 4, this.cpuDsp.dimF, frames];

    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      const leftOffset = frameIndex * this.nFft;
      const rightOffset = (frames * this.nFft) + leftOffset;
      const leftSpectrum = this.fftFrame(framed, leftOffset);
      const rightSpectrum = this.fftFrame(framed, rightOffset);

      for (let freq = 0; freq < this.cpuDsp.dimF; freq += 1) {
        tensor[((freq * frames) + frameIndex)] = freq < 3 ? 0 : leftSpectrum.real[freq];
        tensor[(this.cpuDsp.dimF * frames) + ((freq * frames) + frameIndex)] = freq < 3 ? 0 : leftSpectrum.imag[freq];
        tensor[(2 * this.cpuDsp.dimF * frames) + ((freq * frames) + frameIndex)] = freq < 3 ? 0 : rightSpectrum.real[freq];
        tensor[(3 * this.cpuDsp.dimF * frames) + ((freq * frames) + frameIndex)] = freq < 3 ? 0 : rightSpectrum.imag[freq];
      }
    }

    return { data: tensor, dims, frames };
  }

  private fftFrame(framed: Float32Array, offset: number): { real: Float64Array; imag: Float64Array } {
    const real = new Float64Array(this.nFft);
    const imag = new Float64Array(this.nFft);
    for (let i = 0; i < this.nFft; i += 1) {
      real[i] = framed[offset + i];
    }
    this.cpuDsp.forwardFft.transform(real, imag);
    return { real, imag };
  }
}
