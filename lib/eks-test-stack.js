const { Stack, Duration, CfnParameter, Fn } = require('aws-cdk-lib');
const eks = require('aws-cdk-lib/aws-eks');
const ec2 = require('aws-cdk-lib/aws-ec2');

const { KubectlV24Layer } = require('@aws-cdk/lambda-layer-kubectl-v24');

class EksTestStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);
    const eksVpc = new ec2.Vpc(this, 'eks-vpc', {
      maxAzs: 2,
    });
    const cluster = new eks.Cluster(this, 'stack-cluster', {
      version: eks.KubernetesVersion.V1_24,
      defaultCapacity: 0, // let asg start instances for more control
      kubectlLayer: new KubectlV24Layer(this, 'LayerVersion'),
      albController: {
        version: eks.AlbControllerVersion.V2_4_1,
      },
      subnets: {
        onePerAz: false,
      },
      vpcSubnets: [{
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      }],
    });
    new eks.KubernetesPatch(this, 'enable-prefix-delegation', {
      cluster,
      resourceName: 'daemonset/aws-node',
      resourceNamespace: 'kube-system',
      applyPatch: {
        "spec": {
          "template": {
            "spec": {
              "containers": [
                {
                  "name": "aws-node",
                  "env": [
                    {
                      "name": "ENABLE_PREFIX_DELEGATION",
                      "value": "true"
                    }
                  ]
                }
              ]
            }
          }
        }
      },
      restorePatch: {
        "spec": {
          "template": {
            "spec": {
              "containers": [
                {
                  "name": "aws-node",
                  "env": [
                    {
                      "name": "ENABLE_PREFIX_DELEGATION",
                      "value": "false"
                    }
                  ]
                }
              ]
            }
          }
        }
      }
    });

    cluster.addAutoScalingGroupCapacity('k8s-ags', {
      instanceType: new ec2.InstanceType('t3.small'),
      bootstrapEnabled: true,
      bootstrapOptions: {
        useMaxPods: false,
      },
      desiredCapacity: 1,
      maxCapacity: 1,
      minCapacity: 1,
    });
  }
}

module.exports = { EksTestStack }
